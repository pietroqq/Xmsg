import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database, files } from '@/db/storage';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 5 * 1024 ** 3;
const PART_BYTES = 50 * 1024 ** 2;
const MAX_AVATAR_BYTES = 5 * 1024 ** 2;
const PROFILE_COLUMNS =
  'id, username, name, bio, avatar_id, accent, background, density';
const ACCENTS = new Set(['#8b7cff', '#66d9c0', '#ff8f70', '#78a8ff', '#f0c76a']);
const BACKGROUNDS = new Set(['aurora', 'midnight', 'nebula']);
const DENSITIES = new Set(['comfortable', 'compact']);

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

async function member(id: string, uid: string) {
  const row = await database()
    .prepare('SELECT * FROM conversations WHERE id=? AND (a=? OR b=?)')
    .bind(id, uid, uid)
    .first();
  if (!row) fail('Conversa não encontrada.', 404);
  return row;
}

function safeMime(value: string) {
  const allowed = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/ogg',
    'application/pdf',
    'application/zip',
    'text/plain',
  ]);
  return allowed.has(value) ? value : 'application/octet-stream';
}

function imageMime(bytes: Uint8Array) {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70)
    return 'image/gif';
  if (
    bytes[0] === 82 &&
    bytes[1] === 73 &&
    bytes[2] === 70 &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80
  )
    return 'image/webp';
  return null;
}

type UploadRow = {
  id: string;
  conversation: string;
  sender: string;
  object_key: string;
  upload_id: string;
  filename: string;
  mime: string;
  size: number;
  body: string;
  status: string;
};

async function ownedUpload(id: string, uid: string) {
  const upload = await database()
    .prepare('SELECT * FROM uploads WHERE id=? AND sender=?')
    .bind(id, uid)
    .first<UploadRow>();
  if (!upload || upload.status !== 'uploading')
    fail('Envio não encontrado ou já finalizado.', 404);
  await member(upload.conversation, uid);
  return upload;
}

async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: 'Entre na sua conta para continuar.' }, 401);

    const uid = user.userId;
    const db = database();
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/chat/', '');
    const post = request.method === 'POST';
    const put = request.method === 'PUT';
    const mutation = post || put || request.method === 'DELETE';

    if (mutation) {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) fail('Origem não autorizada.', 403);
    }

    const profile = await db
      .prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id=?`)
      .bind(uid)
      .first();

    if (path === 'me') {
      if (request.method === 'GET') return json({ profile });

      if (post) {
        const value = (await request.json()) as {
          username?: unknown;
          name?: unknown;
        };
        const username =
          typeof value.username === 'string'
            ? value.username.trim().toLowerCase()
            : '';
        const name = typeof value.name === 'string' ? value.name.trim() : '';
        if (!/^[a-z0-9_]{3,24}$/.test(username) || !name || name.length > 60)
          fail('Informe um nome e um usuário válido (3 a 24 letras, números ou _).');
        if (profile) return json({ profile });
        const result = await db
          .prepare(
            'INSERT OR IGNORE INTO profiles(id,username,name,created) VALUES(?,?,?,?)',
          )
          .bind(uid, username, name, Date.now())
          .run();
        if (!result.meta.changes) fail('Esse nome de usuário já está em uso.', 409);
        const created = await db
          .prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id=?`)
          .bind(uid)
          .first();
        return json({ profile: created });
      }

      if (put && profile) {
        const form = await request.formData();
        const username = String(form.get('username') || '').trim().toLowerCase();
        const name = String(form.get('name') || '').trim();
        const bio = String(form.get('bio') || '').trim();
        const accent = String(form.get('accent') || '#8b7cff');
        const background = String(form.get('background') || 'aurora');
        const density = String(form.get('density') || 'comfortable');
        if (!/^[a-z0-9_]{3,24}$/.test(username) || !name || name.length > 60)
          fail('Informe um nome e um usuário válido.');
        if (bio.length > 120) fail('A bio deve ter até 120 caracteres.');
        if (!ACCENTS.has(accent) || !BACKGROUNDS.has(background) || !DENSITIES.has(density))
          fail('Preferência de aparência inválida.');
        const taken = await db
          .prepare('SELECT id FROM profiles WHERE username=? AND id<>?')
          .bind(username, uid)
          .first();
        if (taken) fail('Esse nome de usuário já está em uso.', 409);

        const avatar = form.get('avatar');
        let avatarId = (profile.avatar_id as string | null) || null;
        let oldAvatar: string | null = null;
        if (avatar instanceof File && avatar.size) {
          if (avatar.size > MAX_AVATAR_BYTES)
            fail('A foto de perfil deve ter até 5 MB.', 413);
          const bytes = new Uint8Array(await avatar.arrayBuffer());
          const mime = imageMime(bytes);
          if (!mime) fail('Use uma imagem JPG, PNG, GIF ou WebP.');
          const nextAvatar = `avatars/${uid}/${crypto.randomUUID()}`;
          await files().put(nextAvatar, bytes, { httpMetadata: { contentType: mime } });
          oldAvatar = avatarId;
          avatarId = nextAvatar;
        }

        try {
          await db
            .prepare(
              'UPDATE profiles SET username=?,name=?,bio=?,avatar_id=?,accent=?,background=?,density=? WHERE id=?',
            )
            .bind(username, name, bio || null, avatarId, accent, background, density, uid)
            .run();
        } catch (error) {
          if (avatarId && avatarId !== profile.avatar_id) await files().delete(avatarId);
          throw error;
        }
        if (oldAvatar) await files().delete(oldAvatar);
        const updated = await db
          .prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id=?`)
          .bind(uid)
          .first();
        return json({ profile: updated });
      }

      return json({ error: 'Ação não permitida.' }, 405);
    }

    if (!profile) fail('Crie seu perfil primeiro.', 403);

    if (path.startsWith('avatar/') && request.method === 'GET') {
      const owner = await db
        .prepare('SELECT avatar_id FROM profiles WHERE id=?')
        .bind(path.slice(7))
        .first<{ avatar_id: string | null }>();
      if (!owner?.avatar_id) fail('Foto não encontrada.', 404);
      const object = await files().get(owner.avatar_id);
      if (!object) fail('Foto não encontrada.', 404);
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (path === 'users' && request.method === 'GET') {
      const q = (url.searchParams.get('q') || '').replace(/^@/, '').toLowerCase();
      if (q.length < 2) return json({ users: [] });
      const { results } = await db
        .prepare(
          `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE username LIKE ? ESCAPE '!' AND id<>? ORDER BY username LIMIT 20`,
        )
        .bind(q.replace(/[!%_]/g, '!$&') + '%', uid)
        .all();
      return json({ users: results });
    }

    if (path === 'conversations') {
      if (post) {
        const { peer } = (await request.json()) as { peer: string };
        if (typeof peer !== 'string' || peer === uid) fail('Escolha outra pessoa.');
        if (!await db.prepare('SELECT id FROM profiles WHERE id=?').bind(peer).first())
          fail('Usuário não encontrado.', 404);
        const [a, b] = [uid, peer].sort();
        await db
          .prepare('INSERT OR IGNORE INTO conversations(id,a,b,updated) VALUES(?,?,?,?)')
          .bind(crypto.randomUUID(), a, b, Date.now())
          .run();
        const row = await db
          .prepare('SELECT id FROM conversations WHERE a=? AND b=?')
          .bind(a, b)
          .first();
        return json(row);
      }
      const { results } = await db
        .prepare(
          `SELECT c.id,c.updated,p.id AS peer_id,p.name,p.username,p.bio,p.avatar_id,p.accent,p.background,p.density,
          (SELECT CASE WHEN body='' THEN filename ELSE body END FROM messages WHERE conversation=c.id ORDER BY created DESC,rowid DESC LIMIT 1) AS preview,
          (SELECT count(*) FROM messages WHERE conversation=c.id AND sender<>? AND read_at IS NULL) AS unread
          FROM conversations c JOIN profiles p ON p.id=CASE WHEN c.a=? THEN c.b ELSE c.a END
          WHERE c.a=? OR c.b=? ORDER BY c.updated DESC`,
        )
        .bind(uid, uid, uid, uid)
        .all();
      return json({
        conversations: results.map((row) => ({
          id: row.id,
          updated: row.updated,
          peer: {
            id: row.peer_id,
            name: row.name,
            username: row.username,
            bio: row.bio,
            avatar_id: row.avatar_id,
            accent: row.accent,
            background: row.background,
            density: row.density,
          },
          preview: row.preview || '',
          unread: row.unread,
        })),
      });
    }

    if (path === 'messages') {
      if (request.method === 'GET') {
        const id = url.searchParams.get('conversation') || '';
        await member(id, uid);
        const before = Number(url.searchParams.get('before') || Date.now() + 1);
        const { results } = await db
          .prepare(
            'SELECT * FROM (SELECT * FROM messages WHERE conversation=? AND created<? ORDER BY created DESC,rowid DESC LIMIT 100) ORDER BY created ASC',
          )
          .bind(id, before)
          .all();
        const now = Date.now();
        await db
          .prepare(
            'UPDATE messages SET read_at=? WHERE conversation=? AND sender<>? AND read_at IS NULL AND created<?',
          )
          .bind(now, id, uid, before)
          .run();
        return json({ messages: results, hasMore: results.length === 100 });
      }

      if (Number(request.headers.get('content-length') || 0) > 11 * 1024 ** 2)
        fail('Use o envio de arquivos grandes para este anexo.', 413);
      const form = await request.formData();
      const id = String(form.get('conversation') || '');
      const body = String(form.get('body') || '').trim();
      const upload = form.get('file');
      const requestId = String(form.get('requestId') || '');
      await member(id, uid);
      if (!/^[0-9a-f-]{36}$/.test(requestId)) fail('Solicitação inválida.');
      const existing = await db
        .prepare('SELECT id FROM messages WHERE id=? AND sender=? AND conversation=?')
        .bind(requestId, uid, id)
        .first();
      if (existing) return json({ ok: true });
      const file = upload instanceof File ? upload : null;
      if (!body && !file) fail('Escreva uma mensagem ou anexe um arquivo.');
      if (body.length > 8000) fail('A mensagem deve ter até 8.000 caracteres.');
      if (file && file.size > 10 * 1024 ** 2)
        fail('Use o envio de arquivos grandes para este anexo.', 413);

      let fileId: string | null = null;
      let mime: string | null = null;
      let filename: string | null = null;
      if (file) {
        fileId = crypto.randomUUID();
        filename = file.name.slice(0, 200);
        const bytes = new Uint8Array(await file.arrayBuffer());
        mime = imageMime(bytes) || safeMime(file.type);
        await files().put(fileId, bytes, { httpMetadata: { contentType: mime } });
      }
      try {
        const now = Date.now();
        await db.batch([
          db
            .prepare(
              'INSERT INTO messages(id,conversation,sender,body,created,file_id,filename,mime) VALUES(?,?,?,?,?,?,?,?)',
            )
            .bind(requestId, id, uid, body, now, fileId, filename, mime),
          db.prepare('UPDATE conversations SET updated=? WHERE id=?').bind(now, id),
        ]);
      } catch (error) {
        if (fileId) await files().delete(fileId);
        throw error;
      }
      return json({ ok: true });
    }

    if (path === 'uploads/start' && post) {
      const value = (await request.json()) as Record<string, unknown>;
      const conversation = String(value.conversation || '');
      const filename = String(value.filename || '').trim().slice(0, 200);
      const mime = safeMime(String(value.mime || ''));
      const size = Number(value.size);
      const body = String(value.body || '').trim();
      const requestId = String(value.requestId || '');
      await member(conversation, uid);
      if (!/^[0-9a-f-]{36}$/.test(requestId) || !filename)
        fail('Solicitação de envio inválida.');
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES)
        fail('O arquivo deve ter até 5 GB.', 413);
      if (body.length > 8000) fail('A mensagem deve ter até 8.000 caracteres.');
      await db
        .prepare(
          "UPDATE uploads SET status='expired' WHERE sender=? AND status='uploading' AND created<?",
        )
        .bind(uid, Date.now() - 7 * 24 * 60 * 60 * 1000)
        .run();
      const open = await db
        .prepare("SELECT count(*) AS n FROM uploads WHERE sender=? AND status='uploading'")
        .bind(uid)
        .first<{ n: number }>();
      if (open && open.n >= 3)
        fail('Finalize ou cancele um envio antes de começar outro.', 429);
      const previous = await db
        .prepare('SELECT status FROM uploads WHERE id=? AND sender=?')
        .bind(requestId, uid)
        .first<{ status: string }>();
      if (previous) return json({ id: requestId, partSize: PART_BYTES });
      const objectKey = `messages/${conversation}/${requestId}`;
      const multipart = await files().createMultipartUpload(objectKey, {
        httpMetadata: { contentType: mime },
      });
      try {
        await db
          .prepare(
            'INSERT INTO uploads(id,conversation,sender,object_key,upload_id,filename,mime,size,body,created,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            requestId,
            conversation,
            uid,
            objectKey,
            multipart.uploadId,
            filename,
            mime,
            size,
            body,
            Date.now(),
            'uploading',
          )
          .run();
      } catch (error) {
        await multipart.abort();
        throw error;
      }
      return json({ id: requestId, partSize: PART_BYTES });
    }

    const partMatch = path.match(/^uploads\/([0-9a-f-]{36})\/parts\/(\d+)$/);
    if (partMatch && put) {
      const upload = await ownedUpload(partMatch[1], uid);
      const partNumber = Number(partMatch[2]);
      const expectedParts = Math.ceil(upload.size / PART_BYTES);
      const expectedBytes =
        partNumber === expectedParts
          ? upload.size - PART_BYTES * (expectedParts - 1)
          : PART_BYTES;
      const contentLength = Number(request.headers.get('content-length'));
      if (
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > expectedParts ||
        contentLength !== expectedBytes ||
        !request.body
      )
        fail('Parte do arquivo inválida.', 400);
      const multipart = files().resumeMultipartUpload(upload.object_key, upload.upload_id);
      const part = await multipart.uploadPart(partNumber, request.body);
      return json(part);
    }

    const completeMatch = path.match(/^uploads\/([0-9a-f-]{36})\/complete$/);
    if (completeMatch && post) {
      const upload = await ownedUpload(completeMatch[1], uid);
      const value = (await request.json()) as {
        parts?: Array<{ partNumber: number; etag: string }>;
      };
      const parts = Array.isArray(value.parts)
        ? [...value.parts].sort((a, b) => a.partNumber - b.partNumber)
        : [];
      const expectedParts = Math.ceil(upload.size / PART_BYTES);
      if (
        parts.length !== expectedParts ||
        parts.some(
          (part, index) =>
            part.partNumber !== index + 1 ||
            typeof part.etag !== 'string' ||
            part.etag.length > 200,
        )
      )
        fail('Lista de partes inválida.');
      const multipart = files().resumeMultipartUpload(upload.object_key, upload.upload_id);
      await multipart.complete(parts);
      try {
        const now = Date.now();
        await db.batch([
          db
            .prepare(
              'INSERT INTO messages(id,conversation,sender,body,created,file_id,filename,mime) VALUES(?,?,?,?,?,?,?,?)',
            )
            .bind(
              upload.id,
              upload.conversation,
              uid,
              upload.body,
              now,
              upload.object_key,
              upload.filename,
              upload.mime,
            ),
          db.prepare("UPDATE uploads SET status='complete' WHERE id=?").bind(upload.id),
          db
            .prepare('UPDATE conversations SET updated=? WHERE id=?')
            .bind(now, upload.conversation),
        ]);
      } catch (error) {
        await files().delete(upload.object_key);
        throw error;
      }
      return json({ ok: true });
    }

    const cancelMatch = path.match(/^uploads\/([0-9a-f-]{36})\/cancel$/);
    if (cancelMatch && post) {
      const upload = await ownedUpload(cancelMatch[1], uid);
      const multipart = files().resumeMultipartUpload(upload.object_key, upload.upload_id);
      await multipart.abort();
      await db.prepare("UPDATE uploads SET status='cancelled' WHERE id=?").bind(upload.id).run();
      return json({ ok: true });
    }

    if (path.startsWith('files/') && request.method === 'GET') {
      const row = await db
        .prepare('SELECT conversation,filename,mime FROM messages WHERE file_id=?')
        .bind(path.slice(6))
        .first<{ conversation: string; filename: string; mime: string }>();
      if (!row) fail('Arquivo não encontrado.', 404);
      await member(row.conversation, uid);
      const object = await files().get(path.slice(6));
      if (!object) fail('Arquivo não encontrado.', 404);
      const disposition = row.mime.startsWith('image/') ? 'inline' : 'attachment';
      return new Response(object.body, {
        headers: {
          'Content-Type': row.mime,
          'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }

    return json({ error: 'Não encontrado.' }, 404);
  } catch (error) {
    const current = error as Error & { status?: number };
    if (current.status) return json({ error: current.message }, current.status);
    if (current.message.includes('UNIQUE constraint'))
      return json({ error: 'Esse nome de usuário já está em uso.' }, 409);
    console.error('Chat request failed', current.message);
    return json({ error: 'Não foi possível concluir. Tente novamente.' }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
