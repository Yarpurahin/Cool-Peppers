import { useRef, useState } from 'react';
import { useCatalog } from '../../app/DataProvider.tsx';
import { api, actionErrorMessage } from '../../api/client.ts';
import type { User } from '../../types/api.ts';
import { Avatar } from './Avatar.tsx';
import { Button } from './Button.tsx';

async function prepareAvatar(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error('Выберите PNG, JPEG или WebP размером до 5 МБ.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Не удалось прочитать изображение. Выберите другой файл.');
  });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32_000_000)
      throw new Error('Выберите изображение размером до 32 мегапикселей.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить изображение.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL('image/webp', 0.85);
  } finally {
    bitmap.close();
  }
}
export function AvatarSettings() {
  const { user, setUser } = useCatalog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  if (!user) return null;
  const save = async (file: File | null) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const avatar = file ? await prepareAvatar(file) : null;
      setUser(await api<User>('/me/avatar', { method: 'PATCH', body: { avatar } }));
      setNotice(file ? 'Фото профиля сохранено.' : 'Фото профиля удалено.');
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="avatar-settings">
      <Avatar name={user.name} image={user.avatar} className="avatar avatar--large" />
      <div>
        <h3>Фото профиля</h3>
        <p>PNG, JPEG или WebP до 5 МБ. Фото будет обрезано по центру.</p>
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Фото профиля"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void save(file);
          }}
        />
        <div className="button-row">
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Сохраняем…' : 'Загрузить фото'}
          </Button>
          {user.avatar && (
            <Button variant="ghost" disabled={busy} onClick={() => void save(null)}>
              Удалить фото
            </Button>
          )}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </div>
  );
}
