import { Fragment, useState } from 'react';
import { Icon } from '../../../components/ui/Icon.tsx';

const sections = [
  {
    label: 'Полотно',
    title: 'Полотно',
    items: [
      ['Рамка', 'Потяните по пустому месту левой кнопкой, чтобы выделить несколько блоков.'],
      ['Shift / Ctrl', 'Добавляет блок в текущее выделение или снимает его повторным кликом.'],
      ['Колесо', 'Масштабирует схему. Средняя или правая кнопка мыши перемещает полотно.'],
    ],
  },
  {
    label: 'Связи',
    title: 'Связи и редактирование',
    items: [
      [
        'Клик по реакции',
        'Выбирает реакцию. Двойной клик открывает её параметры и поле редактирования.',
      ],
      ['Точка реакции', 'Потяните её к карточке, чтобы связать реакцию с существующим блоком.'],
      [
        'В пустое место',
        'Завершите перетаскивание на свободном месте — можно создать новую реплику или финал.',
      ],
      ['Delete', 'Удаляет выбранный блок. Если выбрана реакция — удаляется реакция и её связь.'],
    ],
  },
  {
    label: 'История',
    title: 'История изменений',
    items: [
      ['Ctrl + Z', 'Отменить последнее изменение конструктора.'],
      ['Ctrl + Y', 'Вернуть отменённое изменение.'],
      [
        'Ctrl + Shift + Z',
        'Альтернативная команда повтора. В полях ввода работает обычная история текста.',
      ],
    ],
  },
] as const;

export function CanvasHelp({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const section = sections[selected];

  return (
    <section className="maker-canvas-help" role="dialog" aria-label="Справка по полотну">
      <div className="maker-canvas-help-heading">
        <div className="maker-canvas-help-title">
          <span className="maker-canvas-help-title-icon">
            <Icon name="info" size={16} />
          </span>
          <div>
            <strong>Справка по конструктору</strong>
            <span>Полотно, связи, выделение и история изменений</span>
          </div>
        </div>
        <button
          type="button"
          className="maker-canvas-help-close"
          onClick={onClose}
          aria-label="Закрыть справку"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      <p className="maker-canvas-help-intro">
        Реплики и финалы образуют граф разговора. Реакция пользователя задаёт переход к следующему
        блоку.
      </p>
      <div className="maker-canvas-help-navigation" role="group" aria-label="Разделы справки">
        {sections.map((item, index) => (
          <button
            type="button"
            key={item.label}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="maker-canvas-help-section" aria-label={section.title}>
        <h3>{section.title}</h3>
        <div className="maker-canvas-help-grid">
          {section.items.map(([action, description]) => (
            <Fragment key={action}>
              <kbd>{action}</kbd>
              <p>{description}</p>
            </Fragment>
          ))}
        </div>
      </section>
      <p className="maker-canvas-help-note">
        «Упорядочить» перестраивает граф автоматически. Ручное расположение блоков можно вернуть
        через Ctrl + Z.
      </p>
    </section>
  );
}
