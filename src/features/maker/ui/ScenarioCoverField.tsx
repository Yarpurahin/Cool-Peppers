import { useEffect, useId, useRef, useState } from 'react';
import type { ScenarioPreview } from '../../../types/scenario.ts';
import { Icon } from '../../../components/ui/Icon.tsx';

type CoverImage = NonNullable<ScenarioPreview['coverImage']>;

export function ScenarioCoverField({
  value,
  onChange,
}: {
  value: CoverImage | undefined;
  onChange: (image: CoverImage | undefined) => void;
}) {
  const id = useId();
  const generation = useRef(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <section className="maker-cover-field" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Картинка превью</h3>
      {value && <img src={value.src} alt={value.alt} className="maker-cover-preview" />}
      <label className="field">
        {value ? 'Заменить картинку' : 'Загрузить картинку'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          aria-invalid={!!error}
          disabled={loading}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            const token = ++generation.current;
            setError('');
            if (
              !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
              file.size > 512 * 1024
            ) {
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
              if (!image.naturalWidth || !image.naturalHeight)
                throw new Error('Изображение повреждено.');
              if (generation.current === token) onChange({ src, alt: value?.alt ?? '' });
            } catch {
              if (generation.current === token)
                setError('Не удалось открыть изображение. Выберите другой файл.');
            } finally {
              if (generation.current === token) setLoading(false);
            }
          }}
        />
      </label>
      <p id={`${id}-hint`} className="maker-hint">
        PNG, JPG или WebP до 512 КБ. Картинка отображается в каталоге и на странице сценария.
      </p>
      {loading && <p role="status">Загружаем картинку…</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
      {value && (
        <>
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
              Опишите смысл картинки для экранного диктора. Для декоративной картинки оставьте поле
              пустым.
            </small>
          </label>
          <button type="button" className="maker-danger-button" onClick={() => onChange(undefined)}>
            <Icon name="trash" size={16} />
            Удалить картинку
          </button>
        </>
      )}
    </section>
  );
}
