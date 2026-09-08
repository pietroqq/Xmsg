'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Profile } from './chat-types';

const ACCENTS = ['#8b7cff', '#66d9c0', '#ff8f70', '#78a8ff', '#f0c76a'];
const BACKGROUNDS = [
  { id: 'aurora', label: 'Aurora', note: 'Violeta e azul' },
  { id: 'midnight', label: 'Meia-noite', note: 'Azul profundo' },
  { id: 'nebula', label: 'Nebulosa', note: 'Roxo intenso' },
] as const;

type Props = {
  open: boolean;
  profile: Profile;
  onOpenChange: (open: boolean) => void;
  onSaved: (profile: Profile) => void;
  onError: (message: string) => void;
};

export default function ProfileSettings({
  open,
  profile,
  onOpenChange,
  onSaved,
  onError,
}: Props) {
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || '');
  const [accent, setAccent] = useState(profile.accent || ACCENTS[0]);
  const [background, setBackground] = useState(profile.background || 'aurora');
  const [density, setDensity] = useState(profile.density || 'comfortable');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(profile.name);
    setUsername(profile.username);
    setBio(profile.bio || '');
    setAccent(profile.accent || ACCENTS[0]);
    setBackground(profile.background || 'aurora');
    setDensity(profile.density || 'comfortable');
    setAvatar(null);
    setPreview('');
  }, [open, profile]);

  useEffect(() => {
    if (!avatar) return;
    const object = URL.createObjectURL(avatar);
    setPreview(object);
    return () => URL.revokeObjectURL(object);
  }, [avatar]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.set('name', name);
      form.set('username', username);
      form.set('bio', bio);
      form.set('accent', accent);
      form.set('background', background);
      form.set('density', density);
      if (avatar) form.set('avatar', avatar);
      const response = await fetch('/api/chat/me', { method: 'PUT', body: form });
      const data = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok || !data.profile)
        throw new Error(data.error || 'Não foi possível salvar o perfil.');
      onSaved(data.profile);
      onOpenChange(false);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const currentAvatar = preview ||
    (profile.avatar_id
      ? `/api/chat/avatar/${profile.id}?v=${encodeURIComponent(profile.avatar_id)}`
      : '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="settings-dialog"
        style={{ '--user-accent': accent } as React.CSSProperties}
      >
        <div className="settings-heading">
          <span className="settings-icon"><Settings2 size={20} /></span>
          <div>
            <DialogTitle>Personalizar perfil</DialogTitle>
            <DialogDescription>Seu jeito de aparecer no Conversa.</DialogDescription>
          </div>
        </div>
        <form className="settings-form" onSubmit={save}>
          <div className="avatar-editor">
            <button
              type="button"
              className="avatar-preview"
              onClick={() => input.current?.click()}
              aria-label="Escolher foto de perfil"
            >
              {currentAvatar ? (
                <img src={currentAvatar} alt="Prévia da foto de perfil" />
              ) : (
                <span>{name.slice(0, 2).toUpperCase()}</span>
              )}
              <i><Camera size={17} /></i>
            </button>
            <div>
              <strong>Foto de perfil</strong>
              <span>JPG, PNG, GIF ou WebP · até 5 MB</span>
            </div>
            <input
              ref={input}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                if (file && file.size > 5 * 1024 ** 2) {
                  onError('A foto de perfil deve ter até 5 MB.');
                  return;
                }
                setAvatar(file);
              }}
            />
          </div>

          <div className="settings-grid">
            <label>
              Nome
              <input value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              @usuário
              <input
                value={username}
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]+"
                required
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </label>
          </div>
          <label>
            Bio
            <textarea
              value={bio}
              maxLength={120}
              rows={2}
              placeholder="Uma frase sobre você"
              onChange={(e) => setBio(e.target.value)}
            />
            <small>{bio.length}/120</small>
          </label>

          <fieldset>
            <legend>Cor de destaque</legend>
            <div className="accent-options">
              {ACCENTS.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={accent === color ? 'active' : ''}
                  style={{ background: color }}
                  onClick={() => setAccent(color)}
                  aria-label={`Usar a cor ${color}`}
                  aria-pressed={accent === color}
                >
                  {accent === color ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Plano de fundo</legend>
            <div className="background-options">
              {BACKGROUNDS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`background-choice ${option.id} ${background === option.id ? 'active' : ''}`}
                  onClick={() => setBackground(option.id)}
                  aria-pressed={background === option.id}
                >
                  <span>{option.label}</span>
                  <small>{option.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Espaçamento das conversas</legend>
            <div className="density-options">
              <button
                type="button"
                className={density === 'comfortable' ? 'active' : ''}
                onClick={() => setDensity('comfortable')}
              >Confortável</button>
              <button
                type="button"
                className={density === 'compact' ? 'active' : ''}
                onClick={() => setDensity('compact')}
              >Compacto</button>
            </div>
          </fieldset>

          <button className="settings-save" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar personalização'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
