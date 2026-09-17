import { Link } from 'react-router-dom';
import conversationImage from '../assets/images/conversation.png';
import { scenarios } from '../data/scenarios.ts';
import { ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import type { IconName } from '../components/ui/Icon.tsx';
import { ScenarioCard } from '../components/scenarios/ScenarioCard.tsx';

const benefits: { icon: IconName; title: string; text: string }[] = [
  { icon: 'target', title: 'Ситуации из жизни', text: 'У каждой стороны — свои интересы' },
  { icon: 'branch', title: 'Разные пути к решению', text: 'Пространство для новых подходов' },
  { icon: 'chart', title: 'Разбор после практики', text: 'Что сработало и что попробовать ещё' },
];

export function HomePage() {
  return (
    <div className="container home-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="accent-dot" />
            Пространство для практики
          </p>
          <h1>
            Хороший разговор
            <br className="desktop-break" /> начинается
            <br />
            <em>с практики.</em>
          </h1>
          <p className="hero-description">
            Тренируйте сложные переговоры в спокойной обстановке. Пробуйте разные подходы — и
            находите свой способ договариваться.
          </p>
          <ButtonLink to="/scenarios">
            Выбрать сценарий <Icon name="arrow" />
          </ButtonLink>
        </div>
        <figure className="hero-visual">
          <div className="visual-heading">
            <span className="live-dot" />
            От первой реплики — к общему решению<span className="visual-index">01 / 03</span>
          </div>
          <img
            src={conversationImage}
            alt="Два собеседника спокойно обсуждают условия за столом"
            width="1536"
            height="1024"
            fetchPriority="high"
          />
          <figcaption>
            <span className="icon-tile">
              <Icon name="message" />
            </span>
            <div>
              <strong>Здесь вас готовы услышать</strong>
              <span>Потренируйтесь до настоящего разговора</span>
            </div>
            <span className="caption-check">
              <Icon name="check" size={17} />
            </span>
          </figcaption>
        </figure>
      </section>
      <section className="benefits" aria-label="Возможности тренажёра">
        {benefits.map((item) => (
          <div className="benefit" key={item.title}>
            <span className="icon-tile">
              <Icon name={item.icon} />
            </span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </div>
          </div>
        ))}
      </section>
      <section className="home-scenarios">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Один разговор — новый опыт</p>
            <h2>С чего начнём?</h2>
            <p>Выберите разговор, к которому хочется быть готовым.</p>
          </div>
          <Link to="/scenarios" className="text-link">
            Все сценарии <Icon name="arrow" size={18} />
          </Link>
        </div>
        <div className="scenario-grid">
          {scenarios.map((scenario, index) => (
            <ScenarioCard key={scenario.id} scenario={scenario} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
