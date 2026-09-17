import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { DemoNotice } from '../components/ui/DemoNotice.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { scenarios } from '../data/scenarios.ts';
import { useDemoMessage } from '../app/DemoProvider.tsx';

export function EditorListPage() {
  const show = useDemoMessage();
  const scenario = scenarios[0];
  return (
    <div className="container page editor-list-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" />
            Редактор сценариев
          </p>
          <h1>Мои сценарии</h1>
          <p>Создавайте ситуации, в которых хочется разобраться.</p>
        </div>
        <Button
          onClick={() =>
            show(
              'Создание сценария появится позже',
              'Пока можно открыть пример редактора и посмотреть его экраны. Новый сценарий не создан.',
            )
          }
        >
          <Icon name="plus" size={19} />
          Создать сценарий
        </Button>
      </div>
      <DemoNotice>Демонстрация редактора. Сценарии не сохраняются и не публикуются.</DemoNotice>
      <section className="panel editor-list">
        <div className="editor-list-head">
          <span>Название</span>
          <span>Вопросы</span>
          <span>Видимость</span>
          <span />
        </div>
        <div className="editor-list-row">
          <div className="editor-list-title">
            <span className="icon-tile">
              <Icon name="book" size={24} />
            </span>
            <div>
              <h2>{scenario.title}</h2>
              <p>{scenario.category}</p>
            </div>
          </div>
          <span className="question-count">
            {scenario.dialogue.length}
            <span className="mobile-only"> вопроса</span>
          </span>
          <span className="badge badge--orange">Черновик · пример</span>
          <ButtonLink to={`/editor/${scenario.id}`} variant="outline">
            Открыть <Icon name="edit" size={17} />
          </ButtonLink>
        </div>
      </section>
      <section className="tip-box editor-tip">
        <Icon name="bulb" size={25} />
        <div>
          <h2>Начните с одной сложной ситуации</h2>
          <p>Опишите интересы сторон, добавьте реплики и свяжите ответы с вопросами.</p>
        </div>
      </section>
    </div>
  );
}
