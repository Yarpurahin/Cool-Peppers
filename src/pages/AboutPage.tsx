import { Link } from 'react-router-dom';
import conversationImage from '../assets/images/conversation.png';
import { ButtonLink } from '../components/ui/Button.tsx';
import { Icon, type IconName } from '../components/ui/Icon.tsx';

const possibilities: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'message',
    title: 'Находить нужные слова',
    text: 'Говорить о своих интересах, задавать уточняющие вопросы и замечать, что важно собеседнику.',
  },
  {
    icon: 'branch',
    title: 'Пробовать разные подходы',
    text: 'Выбирать реплики, наблюдать за поворотами разговора и возвращаться, чтобы пройти его иначе.',
  },
  {
    icon: 'chart',
    title: 'Учиться на своём опыте',
    text: 'Разбирать принятые решения и сохранять историю попыток — чтобы видеть, как меняется ваш подход.',
  },
];

const steps = [
  [
    'Выберите ситуацию',
    'Начните с разговора, который вам близок. Изучите свою роль, интересы сторон и цель встречи.',
  ],
  [
    'Вступите в диалог',
    'Читайте реплики собеседника и выбирайте ответ. Ваши решения определяют, как пойдёт разговор.',
  ],
  [
    'Заберите опыт с собой',
    'Посмотрите на результат и ход переговоров. Попробуйте ещё раз — уже с другой стратегией.',
  ],
];

export function AboutPage() {
  return (
    <div className="container info-page about-page">
      <section className="hero about-hero" aria-labelledby="about-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="accent-dot" /> О проекте
          </p>
          <h1 id="about-title">
            Договариваться —<br />
            навык, который
            <br />
            <em>можно развивать.</em>
          </h1>
          <p className="hero-description">
            Арена — место для репетиции важных разговоров. Здесь можно остановиться, обдумать ответ
            и попробовать снова. Чтобы в жизни было чуть легче найти общий язык.
          </p>
          <ButtonLink to="/scenarios">
            Найти свой сценарий <Icon name="arrow" />
          </ButtonLink>
          <p className="about-hero-note">Первый шаг — просто попробовать.</p>
        </div>
        <figure className="hero-visual about-visual">
          <div className="visual-heading">
            <span className="live-dot" /> От понимания — к договорённости
          </div>
          <img
            src={conversationImage}
            alt="Два собеседника обсуждают условия за столом в спокойной обстановке"
            width="1536"
            height="1024"
            fetchPriority="high"
          />
          <figcaption>
            <span className="icon-tile">
              <Icon name="message" />
            </span>
            <div>
              <strong>У каждого разговора есть другой путь</strong>
              <span>И здесь есть место, чтобы его найти</span>
            </div>
          </figcaption>
        </figure>
      </section>

      <section className="about-purpose" aria-labelledby="purpose-title">
        <div>
          <p className="eyebrow">Зачем нужна Арена</p>
          <h2 id="purpose-title">
            Важные разговоры
            <br />
            заслуживают репетиции.
          </h2>
        </div>
        <div className="about-purpose-copy">
          <p>
            Обсудить условия работы, отстоять свою позицию, услышать чужую — такие разговоры знакомы
            каждому. Но возможность спокойно потренироваться бывает не всегда.
          </p>
          <p>
            Мы создали Арену, чтобы у вас было пространство для практики. Наша цель — помочь лучше
            понимать себя и собеседника, замечать варианты и увереннее идти к договорённости.
          </p>
        </div>
      </section>

      <section className="info-section" aria-labelledby="possibilities-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Что можно попробовать</p>
            <h2 id="possibilities-title">Один разговор. Несколько открытий.</h2>
          </div>
        </div>
        <div className="about-card-grid">
          {possibilities.map((item) => (
            <article className="panel about-card" key={item.title}>
              <span className="icon-tile">
                <Icon name={item.icon} size={23} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="info-section about-practice" aria-labelledby="practice-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Как всё устроено</p>
            <h2 id="practice-title">От первого ответа — к новому опыту.</h2>
          </div>
          <Link to="/scenarios" className="text-link">
            К сценариям <Icon name="arrow" size={18} />
          </Link>
        </div>
        <ol className="about-steps">
          {steps.map(([title, text], index) => (
            <li key={title}>
              <span className="about-step-number" aria-hidden="true">
                0{index + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <p className="about-practice-note">
          <Icon name="info" size={18} /> Для прохождения и сохранения истории нужен аккаунт.
          Доступность тренировки указана в карточке сценария.
        </p>
      </section>

      <section className="about-invitation" aria-labelledby="invitation-title">
        <div>
          <p className="eyebrow">Навык, который остаётся с вами</p>
          <h2 id="invitation-title">
            Следующий разговор
            <br />
            может начаться увереннее.
          </h2>
          <p>
            Выберите ситуацию и сделайте первый шаг.
            <br />
            Здесь не нужно уметь всё заранее.
          </p>
        </div>
        <div className="about-invitation-actions">
          <ButtonLink to="/scenarios">
            Начать практику <Icon name="arrow" />
          </ButtonLink>
          <Link to="/feedback" className="text-link">
            Есть идея для Арены? <Icon name="upRight" size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
