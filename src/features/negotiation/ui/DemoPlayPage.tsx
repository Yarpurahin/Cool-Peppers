import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCatalog } from '../../../app/DataProvider.tsx';
import type { ScenarioPreview } from '../../../types/scenario.ts';
import { ButtonLink } from '../../../components/ui/Button.tsx';
import { DemoNotice } from '../../../components/ui/DemoNotice.tsx';
import { useDemoMessage } from '../../../app/DemoProvider.tsx';
import { PlayView } from './PlayView.tsx';
import { ErrorPage } from '../../../pages/ErrorPage.tsx';

export function DemoPlayPage() {
  const { findScenario } = useCatalog();
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  return scenario ? <PlayScreen scenario={scenario} key={scenario.id} /> : <ErrorPage />;
}

function PlayScreen({ scenario }: { scenario: ScenarioPreview }) {
  const [selected, setSelected] = useState<string | null>(null);
  const show = useDemoMessage();
  const first = scenario.dialogue[0];
  return (
    <PlayView
      model={{
        scenarioId: scenario.id,
        title: scenario.title,
        goal: scenario.goal,
        role: scenario.role,
        tip: 'Не ищите «идеальную» реплику. Выберите подход, который хотите попробовать.',
        character: scenario.person,
        question: { id: 'demo-first', title: first.title, text: first.speech },
        answers: first.answers.map((answer, index) => ({ id: String(index), text: answer.text })),
        step: 1,
        history: [],
        stages: [
          { id: 'understand', title: 'Понять позицию', state: 'current' },
          { id: 'options', title: 'Найти варианты', state: 'future' },
          { id: 'agree', title: 'Договориться о шаге', state: 'future' },
        ],
      }}
      selectedId={selected}
      onSelect={setSelected}
      onAnswer={() =>
        show(
          'Ответ не отправлен',
          'Это макет экрана. Продолжение диалога появится после подключения логики сценария.',
        )
      }
      onSaveExit={() =>
        show('Сохранение появится позже', 'Это макет экрана, прохождение ещё не запущено.')
      }
      notice={
        <DemoNotice>
          Демонстрация диалога. Реплики можно выбирать, но прохождение и оценка пока не подключены.
        </DemoNotice>
      }
      footer={
        <div className="result-preview-link">
          <ButtonLink to={`/scenarios/${scenario.id}/result`} variant="outline">
            Пример разбора
          </ButtonLink>
        </div>
      }
    />
  );
}
