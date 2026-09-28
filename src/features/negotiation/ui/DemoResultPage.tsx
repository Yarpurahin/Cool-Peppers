import { useNavigate, useParams } from 'react-router-dom';
import { useCatalog } from '../../../app/DataProvider.tsx';
import { DemoNotice } from '../../../components/ui/DemoNotice.tsx';
import { useDemoMessage } from '../../../app/DemoProvider.tsx';
import { ResultView } from './ResultView.tsx';
import { FeedbackForm } from './FeedbackForm.tsx';
import { ErrorPage } from '../../../pages/ErrorPage.tsx';

export function DemoResultPage() {
  const { findScenario } = useCatalog();
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  const navigate = useNavigate();
  const show = useDemoMessage();
  if (!scenario) return <ErrorPage />;
  return (
    <ResultView
      model={{
        scenarioId: scenario.id,
        title: scenario.title,
        outcome: scenario.example.outcome,
        outcomeType: 'neutral',
        subtitle: 'Пример разбора',
        nextStep: scenario.example.nextStep,
        metric: {
          value: scenario.example.score,
          label: 'из 100 · пример',
          percent: scenario.example.score,
        },
        reviews: scenario.example.observations.map((item, index) => ({
          ...item,
          id: String(index),
          penalty: 0,
        })),
      }}
      onRestart={() => navigate(`/scenarios/${scenario.id}/play`)}
      notice={
        <DemoNotice>
          Пример обратной связи. Этот разбор и баллы подготовлены заранее и не оценивают ваши
          действия.
        </DemoNotice>
      }
      feedback={
        <FeedbackForm
          key={scenario.id}
          caption="Демонстрационная форма"
          onSubmit={() => {
            show('Отправка отзыва пока недоступна', 'Ваш отзыв никуда не отправлен.');
            throw new Error('Демонстрационная форма: отзыв не сохранён.');
          }}
        />
      }
    />
  );
}
