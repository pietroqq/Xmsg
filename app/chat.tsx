'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  Copy,
  Check,
  FileText,
  LogOut,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Conversation, Message, Profile } from './chat-types';
import ProfileSettings from './profile-settings';
import WelcomeMotion from './welcome-motion';

const MAX_FILE_BYTES = 5 * 1024 ** 3;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/chat' + path, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data;
}

const clock = (time: number) =>
  new Date(time).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand compact' : 'brand'}>
      <img src="/xmsg-logo.jpg" alt="" />
      {compact ? null : <strong>Xmsg</strong>}
    </span>
  );
}

function Avatar({
  profile,
  name = 'Você',
}: {
  profile?: Partial<Profile> | null;
  name?: string;
}) {
  const label = profile?.name || name;
  return (
    <span className="avatar" style={{ '--avatar-accent': profile?.accent || '#8b7cff' } as CSSProperties}>
      {profile?.avatar_id && profile.id ? (
        <img
          src={`/api/chat/avatar/${profile.id}?v=${encodeURIComponent(profile.avatar_id)}`}
          alt={`Foto de ${label}`}
        />
      ) : (
        label.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function MessageText({ value }: { value: string }) {
  return (
    <>
      {value.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function Chat({ signedIn }: { signedIn: boolean }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(!signedIn);
  const [list, setList] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [filter, setFilter] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const activeRef = useRef<string | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const activeUpload = useRef<string | null>(null);
  activeRef.current = active?.id || null;

  useEffect(() => {
    document.documentElement.dataset.chatTheme = me?.background || 'aurora';
    return () => { delete document.documentElement.dataset.chatTheme; };
  }, [me?.background]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyMessage(message: Message) {
    const text = message.body || (message.file_id ? message.filename + '\n' + location.origin + '/api/chat/files/' + message.file_id : '');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(message.id);
    } catch {
      setError('Não foi possível copiar. Selecione o texto e use Ctrl+C ou a opção Copiar do celular.');
    }
  }

  useEffect(() => {
    if (!signedIn) return;
    api<{ profile: Profile | null }>('/me')
      .then((data) => setMe(data.profile))
      .catch((current) => setError(current.message))
      .finally(() => setLoaded(true));
  }, [signedIn]);

  useEffect(() => {
    if (!me) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const data = await api<{ conversations: Conversation[] }>('/conversations');
        if (!stopped) setList(data.conversations);
      } catch (current) {
        if (!stopped) setError((current as Error).message);
      }
    };
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [me]);

  useEffect(() => {
    if (!active) return;
    setMessages([]);
    setHasMore(false);
    let stopped = false;
    let first = true;
    const refresh = async () => {
      try {
        const data = await api<{ messages: Message[]; hasMore: boolean }>(
          '/messages?conversation=' + active.id,
        );
        if (stopped) return;
        setMessages((previous) => {
          const updated = new Map(previous.map((message) => [message.id, message]));
          data.messages.forEach((message) => updated.set(message.id, message));
          return [...updated.values()].sort((a, b) => a.created - b.created);
        });
        if (first) {
          setHasMore(data.hasMore);
          first = false;
        }
      } catch (current) {
        if (!stopped) setError((current as Error).message);
      }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active?.id]);

  useEffect(() => {
    if (!olderBusy) end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.at(-1)?.id]);

  useEffect(() => {
    if (!newChatOpen || query.trim().length < 2) {
      setPeople([]);
      return;
    }
    let stopped = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ users: Profile[] }>('/users?q=' + encodeURIComponent(query.trim()))
        .then((data) => {
          if (!stopped) setPeople(data.users);
        })
        .catch((current) => setError(current.message))
        .finally(() => {
          if (!stopped) setSearching(false);
        });
    }, 300);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [query, newChatOpen]);

  async function createProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ profile: Profile }>('/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username }),
      });
      setMe(data.profile);
    } catch (current) {
      setError((current as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startConversation(peer: Profile) {
    setBusy(true);
    try {
      const data = await api<{ id: string }>('/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer: peer.id }),
      });
      setActive({
        id: data.id,
        peer,
        preview: '',
        updated: Date.now(),
        unread: 0,
      });
      setNewChatOpen(false);
      setQuery('');
    } catch (current) {
      setError((current as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshActive(conversationId: string) {
    if (activeRef.current === conversationId) {
      const data = await api<{ messages: Message[] }>(
        '/messages?conversation=' + conversationId,
      );
      setMessages((previous) => {
        const merged = new Map(previous.map((message) => [message.id, message]));
        data.messages.forEach((message) => merged.set(message.id, message));
        return [...merged.values()].sort((a, b) => a.created - b.created);
      });
    }
    const conversations = await api<{ conversations: Conversation[] }>('/conversations');
    setList(conversations.conversations);
  }

  async function uploadFile(
    selected: File,
    conversationId: string,
    messageBody: string,
  ) {
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    uploadController.current = controller;
    activeUpload.current = requestId;
    const created = await api<{ id: string; partSize: number }>('/uploads/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation: conversationId,
        filename: selected.name,
        mime: selected.type,
        size: selected.size,
        body: messageBody,
        requestId,
      }),
      signal: controller.signal,
    });
    const partCount = Math.ceil(selected.size / created.partSize);
    const parts = new Array<{ partNumber: number; etag: string }>(partCount);
    let nextPart = 0;
    let uploadedBytes = 0;

    const uploadOne = async (index: number) => {
      const start = index * created.partSize;
      const endAt = Math.min(selected.size, start + created.partSize);
      const chunk = selected.slice(start, endAt);
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const part = await api<{ partNumber: number; etag: string }>(
            `/uploads/${created.id}/parts/${index + 1}`,
            { method: 'PUT', body: chunk, signal: controller.signal },
          );
          parts[index] = part;
          uploadedBytes += chunk.size;
          setUploadProgress(Math.round((uploadedBytes / selected.size) * 100));
          return;
        } catch (current) {
          lastError = current as Error;
          if (controller.signal.aborted) throw current;
          await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
        }
      }
      throw lastError || new Error('Falha ao enviar uma parte do arquivo.');
    };

    const worker = async () => {
      while (true) {
        const index = nextPart;
        nextPart += 1;
        if (index >= partCount) return;
        await uploadOne(index);
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(3, partCount) }, () => worker()),
      );
      await api(`/uploads/${created.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }),
        signal: controller.signal,
      });
    } catch (current) {
      if (!controller.signal.aborted) {
        void api(`/uploads/${created.id}/cancel`, { method: 'POST' }).catch(() => {});
      }
      throw current;
    } finally {
      uploadController.current = null;
      activeUpload.current = null;
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!active || busy || (!body.trim() && !file)) return;
    const conversationId = active.id;
    const messageBody = body.trim();
    const selected = file;
    setBusy(true);
    setUploadProgress(selected ? 0 : null);
    setError('');
    try {
      if (selected) {
        await uploadFile(selected, conversationId, messageBody);
      } else {
        const form = new FormData();
        form.set('conversation', conversationId);
        form.set('body', messageBody);
        form.set('requestId', crypto.randomUUID());
        await api('/messages', { method: 'POST', body: form });
      }
      if (activeRef.current === conversationId) {
        setBody('');
        setFile(null);
      }
      await refreshActive(conversationId);
    } catch (current) {
      const aborted =
        uploadController.current?.signal.aborted ||
        (current as Error).name === 'AbortError';
      setError(aborted ? 'Envio cancelado.' : (current as Error).message);
    } finally {
      setBusy(false);
      setUploadProgress(null);
      uploadController.current = null;
      activeUpload.current = null;
    }
  }

  function cancelUpload() {
    uploadController.current?.abort();
    const id = activeUpload.current;
    if (id) void api(`/uploads/${id}/cancel`, { method: 'POST' }).catch(() => {});
  }

  async function loadOlder() {
    if (!active || !messages.length) return;
    const id = active.id;
    setOlderBusy(true);
    try {
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/messages?conversation=${id}&before=${messages[0].created}`,
      );
      if (activeRef.current === id) {
        setMessages((current) => [...data.messages, ...current]);
        setHasMore(data.hasMore);
      }
    } catch (current) {
      setError((current as Error).message);
    } finally {
      setOlderBusy(false);
    }
  }

  const appStyle = {
    '--user-accent': me?.accent || '#8b7cff',
  } as CSSProperties;

  return (
    <main
      className="app-shell"
      data-background={me?.background || 'aurora'}
      data-density={me?.density || 'comfortable'}
      style={appStyle}
    >
      <aside className="rail">
        <a href="/" className="brand-mark" aria-label="Xmsg">
          <Brand compact />
        </a>
        <div className="rail-selected"><MessageCircle size={22} /></div>
        {me ? (
          <button className="rail-action" aria-label="Personalizar perfil" onClick={() => setSettingsOpen(true)}>
            <Settings size={21} />
          </button>
        ) : null}
        <span className="rail-bottom">X.</span>
      </aside>

      <section className={`inbox ${active ? 'mobile-hidden' : ''}`}>
        <header className="inbox-title">
          <div>
            <span className="eyebrow">SEU ESPAÇO PARA CONECTAR</span>
            <h1>Conversas<span className="brand-dot">.</span></h1>
          </div>
          <button className="icon-button new-chat" aria-label="Nova conversa" onClick={() => setNewChatOpen(true)} disabled={!me}>
            <Plus />
          </button>
        </header>
        <label className="search-box">
          <Search size={18} />
          <input placeholder="Buscar nas suas conversas" value={filter} onChange={(e) => setFilter(e.target.value)} disabled={!me} />
        </label>
        <div className="list-label">MENSAGENS <span>{list.length.toString().padStart(2, '0')}</span></div>
        <div className="conversation-list">
          {list
            .filter((conversation) =>
              (conversation.peer.name + conversation.peer.username).toLowerCase().includes(filter.toLowerCase()),
            )
            .map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation ${active?.id === conversation.id ? 'selected' : ''}`}
                onClick={() => {
                  setActive(conversation);
                  setBody('');
                  setFile(null);
                }}
              >
                <Avatar profile={conversation.peer} />
                <span className="conversation-copy">
                  <strong>{conversation.peer.name}</strong>
                  <span>{conversation.preview || 'Comece a conversa'}</span>
                </span>
                <span className="conversation-meta">
                  <time>{clock(conversation.updated)}</time>
                  {conversation.unread > 0 ? <b>{conversation.unread}</b> : null}
                </span>
              </button>
            ))}
          {!list.length ? (
            <div className="inbox-empty">
              <MessageCircle size={30} />
              <h3>Uma boa conversa<br />começa com um oi.</h3>
              <p>Encontre alguém pelo @usuário<br />e mande a primeira mensagem.</p>
              {me ? (
                <button onClick={() => setNewChatOpen(true)} className="text-button">
                  Nova conversa <ArrowUpRight size={17} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <footer className="my-profile">
          <Avatar profile={me} />
          <button className="profile-copy" onClick={() => me && setSettingsOpen(true)} disabled={!me}>
            <strong>{me?.name || 'Seu perfil'}</strong>
            <span>{me ? `@${me.username}` : 'Entre para conversar'}</span>
          </button>
          {me ? <button className="profile-settings" aria-label="Personalizar perfil" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button> : null}
          {me ? <a href="/signout-with-chatgpt?return_to=%2F" aria-label="Sair"><LogOut size={18} /></a> : null}
        </footer>
      </section>

      <section className={`chat-panel ${!active ? 'mobile-welcome' : ''}`}>
        {error ? (
          <div role="alert" className="error-bar">
            {error}<button aria-label="Fechar aviso" onClick={() => setError('')}><X size={18} /></button>
          </div>
        ) : null}
        {!loaded ? (
          <WelcomeMotion><p>Carregando sua conta…</p></WelcomeMotion>
        ) : !signedIn ? (
          <WelcomeMotion>
            <Brand />
            <span className="eyebrow">PERTO, MESMO DE LONGE</span>
            <h2>O próximo “oi”<br />começa aqui<span>.</span></h2>
            <p>Suas pessoas. Suas histórias.<br />Um lugar para manter a conversa viva.</p>
            <a className="primary-button" href="/signin-with-chatgpt?return_to=%2F" target="_top">
              Entrar com ChatGPT <ArrowUpRight size={19} />
            </a>
            <span className="small-note">Depois de entrar, escolha seu @usuário.</span>
            <div className="welcome-features"><span>Mensagens</span><i /><span>Imagens</span><i /><span>Arquivos até 5 GB</span></div>
          </WelcomeMotion>
        ) : !me ? (
          <WelcomeMotion>
            <Brand />
            <h2>Como te<br />encontramos<span>?</span></h2>
            <p>Escolha o nome que aparece nas conversas<br />e um @usuário só seu.</p>
            <form className="profile-form" onSubmit={createProfile}>
              <label>Seu nome<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Como você gosta de ser chamado" /></label>
              <label>Nome de usuário<input required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="seu_usuario" /></label>
              <span className="small-note">3 a 24 letras, números ou _</span>
              <button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : 'Criar meu perfil'}<ArrowUpRight size={18} /></button>
            </form>
          </WelcomeMotion>
        ) : !active ? (
          <WelcomeMotion>
            <Brand />
            <span className="eyebrow">ESPAÇO PARA SUAS HISTÓRIAS</span>
            <h2>Menos distância.<br />Mais conversa<span>.</span></h2>
            <p>Procure um @usuário e envie seu primeiro oi.<br />As próximas mensagens aparecem por aqui.</p>
            <button className="primary-button" onClick={() => setNewChatOpen(true)}>Iniciar uma conversa <Plus size={18} /></button>
            <span className="small-note">Você pode ser encontrado como @{me.username}</span>
          </WelcomeMotion>
        ) : (
          <>
            <header className="chat-header">
              <button className="icon-button back" aria-label="Voltar" onClick={() => setActive(null)}><ArrowLeft /></button>
              <Avatar profile={active.peer} />
              <div><h2>{active.peer.name}</h2><span>@{active.peer.username}{active.peer.bio ? ` · ${active.peer.bio}` : ''}</span></div>
              <span className="header-caption">Uma conversa de cada vez.</span>
            </header>
            <div className="messages">
              {hasMore ? <button className="text-button" disabled={olderBusy} onClick={loadOlder}>{olderBusy ? 'Carregando…' : 'Carregar mensagens anteriores'}</button> : null}
              <div className="date-pill">{messages.length ? new Date(messages[0].created).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) : 'Hoje'}</div>
              {!messages.length ? <div className="first-message"><Avatar profile={active.peer} /><h3>Diga oi para {active.peer.name.split(' ')[0]}.</h3><p>Este é o começo da conversa de vocês.</p></div> : null}
              {messages.map((message) => (
                <div key={message.id} className={`bubble ${message.sender === me.id ? 'sent' : 'received'}`}>
                  {message.file_id ? (
                    message.mime?.startsWith('image/') ? (
                      <a target="_blank" rel="noopener noreferrer" href={`/api/chat/files/${message.file_id}`}><img className="message-image" src={`/api/chat/files/${message.file_id}`} alt={message.filename || 'Imagem anexada'} /></a>
                    ) : (
                      <a className="file-link" href={`/api/chat/files/${message.file_id}`}><FileText size={26} /><span>{message.filename}<small>Baixar arquivo</small></span><ArrowUpRight size={18} /></a>
                    )
                  ) : null}
                  {message.body ? <p><MessageText value={message.body} /></p> : null}
                  <button type="button" className="copy-message" aria-label={copied === message.id ? 'Mensagem copiada' : 'Copiar mensagem'} title="Copiar mensagem" onClick={() => copyMessage(message)}>
                    {copied === message.id ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied === message.id ? 'Copiada' : 'Copiar'}</span>
                  </button>
                  <span className="message-time">{clock(message.created)}{message.sender === me.id ? <CheckCheck size={15} className={message.read_at ? 'read' : ''} aria-label={message.read_at ? 'Lida' : 'Enviada'} /> : null}</span>
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="composer-wrap">
              {file ? (
                <div className="attachment-preview">
                  <Paperclip size={16} />
                  <span><strong>{file.name}</strong><small>{(file.size / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</small></span>
                  {uploadProgress !== null ? <span className="upload-percent">{uploadProgress}%</span> : null}
                  <button aria-label={busy ? 'Cancelar envio' : 'Remover anexo'} onClick={busy ? cancelUpload : () => setFile(null)}><X size={18} /></button>
                  {uploadProgress !== null ? <i className="upload-track"><span style={{ width: `${uploadProgress}%` }} /></i> : null}
                </div>
              ) : null}
              {emoji ? <div className="emoji-picker">{['😊', '❤️', '👍', '😂', '🎉', '👋', '✨', '🙌'].map((item) => <button key={item} onClick={() => { setBody((current) => current + item); setEmoji(false); }}>{item}</button>)}</div> : null}
              <form className="composer" onSubmit={send} onPaste={(event) => {
                if (busy) return;
                const pasted = event.clipboardData.files[0];
                if (!pasted) return;
                event.preventDefault();
                if (pasted.size > MAX_FILE_BYTES) { setError('O arquivo deve ter até 5 GB.'); return; }
                if (file) { setError('Remova ou envie o anexo atual antes de colar outro.'); return; }
                setFile(pasted);
                const text = event.clipboardData.getData('text/plain');
                if (text) setBody((current) => (current + text).slice(0, 8000));
              }}>
                <button type="button" className="icon-button" aria-label="Escolher emoji" onClick={() => setEmoji(!emoji)}><Smile /></button>
                <button type="button" className="icon-button" aria-label="Anexar imagem ou arquivo" onClick={() => input.current?.click()} disabled={busy}><Paperclip /></button>
                <input type="file" hidden ref={input} onChange={(event) => { const selected = event.target.files?.[0]; if (selected && selected.size > MAX_FILE_BYTES) setError('O arquivo deve ter até 5 GB.'); else setFile(selected || null); event.target.value = ''; }} />
                <textarea placeholder="Escreva sua mensagem…" aria-label="Mensagem" value={body} maxLength={8000} rows={1} disabled={busy} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <button className="send-button" aria-label="Enviar mensagem" disabled={busy || (!body.trim() && !file)}><Send size={21} /></button>
              </form>
              <span className="composer-note">{uploadProgress !== null ? `Enviando arquivo · ${uploadProgress}%` : 'Enter para enviar · Shift + Enter para pular linha · Anexos até 5 GB'}</span>
            </div>
          </>
        )}
      </section>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent>
          <DialogTitle className="dialog-title">Uma nova conversa</DialogTitle>
          <DialogDescription>Encontre quem você procura pelo @usuário.</DialogDescription>
          <label className="search-box"><Search size={18} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite pelo menos 2 caracteres" aria-label="Buscar usuários" /></label>
          <div className="people-list">
            {people.map((person) => <button className="person" key={person.id} onClick={() => startConversation(person)} disabled={busy}><Avatar profile={person} /><span><strong>{person.name}</strong><small>@{person.username}{person.bio ? ` · ${person.bio}` : ''}</small></span><ArrowUpRight size={18} /></button>)}
            {query.length >= 2 && !people.length ? <p>{searching ? 'Procurando…' : 'Nenhum usuário encontrado.'}</p> : null}
          </div>
        </DialogContent>
      </Dialog>

      {me ? (
        <ProfileSettings
          open={settingsOpen}
          profile={me}
          onOpenChange={setSettingsOpen}
          onSaved={setMe}
          onError={setError}
        />
      ) : null}
    </main>
  );
}
