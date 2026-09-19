import { useSearchParams } from 'react-router-dom';
import { scenarios } from '../data/scenarios.ts';
import { ScenarioCard } from '../components/scenarios/ScenarioCard.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const level = params.get('level') ?? '';
  const categories = [...new Set(scenarios.map((item) => item.category))];
  const levels = [...new Set(scenarios.map((item) => item.level))];
  function update(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const normalized = query.trim().toLocaleLowerCase('ru');
  const filtered = scenarios.filter(
    (item) =>
      (!category || item.category === category) &&
      (!level || item.level === level) &&
      `${item.title} ${item.skill} ${item.category} ${item.description}`
        .toLocaleLowerCase('ru')
        .includes(normalized),
  );

  return (
    <div className="container page catalog-page">
      <div className="page-heading">
        <p className="eyebrow">
          <span className="accent-dot" />
          Каталог практики
        </p>
        <h1>
          У каждого разговора
          <br />
          <em>есть несколько путей.</em>
        </h1>
        <p>Выберите ситуацию и потренируйтесь находить общий язык.</p>
      </div>
      <div className="filter-panel" role="search" aria-label="Поиск сценариев">
        <div className="search-field">
          <Icon name="search" size={19} />
          <label className="sr-only" htmlFor="scenario-search">
            Найти сценарий или навык
          </label>
          <input
            id="scenario-search"
            type="search"
            placeholder="Найти сценарий или навык"
            value={query}
            onChange={(event) => update('q', event.target.value)}
          />
        </div>
        <label className="filter-select">
          <span className="sr-only">Категория</span>
          <select
            aria-label="Категория"
            value={category}
            onChange={(event) => update('category', event.target.value)}
          >
            <option value="">Все категории</option>
            {category && !categories.includes(category) && (
              <option value={category}>Неизвестная категория</option>
            )}
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span className="sr-only">Сложность</span>
          <select
            aria-label="Сложность"
            value={level}
            onChange={(event) => update('level', event.target.value)}
          >
            <option value="">Любая сложность</option>
            {level && !levels.includes(level as (typeof levels)[number]) && (
              <option value={level}>Неизвестная сложность</option>
            )}
            {levels.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
          <Icon name="reset" size={17} />
          Сбросить
        </Button>
      </div>
      <div className="results-line">
        <p role="status" aria-live="polite">
          Найдено сценариев: <strong>{filtered.length}</strong> из {scenarios.length}
        </p>
        <span>Разговоры, к которым стоит подготовиться</span>
      </div>
      {filtered.length ? (
        <div className="scenario-grid">
          {filtered.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              index={scenarios.indexOf(scenario)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="icon-tile">
            <Icon name="search" size={28} />
          </span>
          <h2>Пока ничего не нашлось</h2>
          <p>Попробуйте другое слово или уберите часть фильтров.</p>
          <Button variant="outline" onClick={() => setParams({})}>
            Сбросить фильтры <Icon name="reset" size={17} />
          </Button>
        </div>
      )}
    </div>
  );
}
