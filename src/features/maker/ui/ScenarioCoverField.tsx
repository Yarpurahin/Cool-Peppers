import { useEffect, useId, useRef, useState } from 'react';
import type { ScenarioPreview } from '../../../types/scenario.ts';
import { Icon } from '../../../components/ui/Icon.tsx';

type CoverImage = NonNullable<ScenarioPreview['coverImage']>;
const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];

export function ScenarioCoverField({
  value,
  onChange,
}: {
  value: CoverImage | undefined;
  onChange: (image: CoverImage | undefined) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const loadFile = async (file?: File) => {
    if (!file) return;
    const token = ++generation.current;
    setError('');
    if (!acceptedTypes.includes(file.type) || file.size > 512 * 1024) {
      setError('Выберите PNG, JPG или WebP размером до 512 КБ.');
      return;
    }
    setLoading(true);
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = src;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Изображение повреждено.');
      if (generation.current === token) onChange({ src, alt: value?.alt ?? '' });
    } catch {
      if (generation.current === token)
        setError('Не удалось открыть изображение. Выберите другой файл.');
    } finally {
      if (generation.current === token) setLoading(false);
    }
  };

  return (
    <section className="maker-cover-field" aria-labelledby={`${id}-title`}>
      <div className="maker-cover-heading">
        <div>
          <h3 id={`${id}-title`}>Обложка сценария</h3>
          <p>Используется в каталоге и на странице сценария.</p>
        </div>
        {value && (
          <button
            type="button"
            className="maker-cover-remove"
            onClick={() => onChange(undefined)}
          >
            <Icon name="trash" size={15} />
            Удалить
          </button>
        )}
      </div>

      {value ? (
        <div className="maker-cover-preview-wrap">
          <img src={value.src} alt={value.alt} className="maker-cover-preview" />
          <span className="maker-cover-crop-label">Предпросмотр карточки</span>
          <button
            type="button"
            className="maker-cover-replace"
            onClick={() => input.current?.click()}
            disabled={loading}
          >
            <Icon name="edit" size={16} />
            Заменить обложку
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`maker-cover-dropzone ${dragging ? 'is-dragging' : ''}`}
          onClick={() => input.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void loadFile(event.dataTransfer.files?.[0]);
          }}
          disabled={loading}
        >
          <span className="maker-cover-dropzone-icon">
            <Icon name="plus" size={20} />
          </span>
          <strong>{loading ? 'Загружаем…' : 'Добавить обложку'}</strong>
          <span>Перетащите изображение сюда или выберите файл</span>
          <small>PNG, JPG или WebP · до 512 КБ</small>
        </button>
      )}

      <input
        ref={input}
        className="maker-cover-file-input"
        type="file"
        aria-label="Загрузить картинку"
        tabIndex={-1}
        accept="image/png,image/jpeg,image/webp"
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={!!error}
        disabled={loading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void loadFile(file);
        }}
      />
      <p id={`${id}-hint`} className="maker-hint maker-cover-hint">
        В карточках изображение показывается в формате 360 × 176 и аккуратно обрезается по центру. Исходный файл не изменяется.
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
      {value && (
        <label className="field">
          Описание изображения
          <input
            aria-label="Описание изображения"
            value={value.alt}
            maxLength={250}
            aria-describedby={`${id}-alt-hint`}
            onChange={(event) => onChange({ ...value, alt: event.target.value })}
          />
          <small id={`${id}-alt-hint`}>
            Для декоративной картинки поле можно оставить пустым.
          </small>
        </label>
      )}
    </section>
  );
}
