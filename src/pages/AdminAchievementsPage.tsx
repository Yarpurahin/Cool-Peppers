import { useEffect, useMemo, useRef, useState } from 'react';
import { api, actionErrorMessage, errorMessage } from '../api/client.ts';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import type { AdminAchievement } from '../types/api.ts';
import {
  ACHIEVEMENT_CONDITIONS,
  ACHIEVEMENT_ICON_NAMES,
  type AchievementConditionType,
  type AchievementIconName,
} from '../features/gamification/model.ts';

interface AchievementForm {
  title: string;
  description: string;
  icon: AchievementIconName;
  conditionType: AchievementConditionType;
  conditionValue: number;
  conditionParam: string | null;
  isActive: boolean;
}

const EMPTY: AchievementForm = {
  title: '',
  description: '',
  icon: 'award',
  conditionType: 'completed_attempts',
  conditionValue: 1,
  conditionParam: null,
  isActive: true,
};

const condition = (type: AchievementConditionType) =>
  ACHIEVEMENT_CONDITIONS.find((item) => item.value === type)!;

const difficultyLabels = {
  easy: 'Начальный',
  medium: 'Средний',
  hard: 'Сложный',
} as const;

function fromAchievement(value: AdminAchievement): AchievementForm {
  return {
    title: value.title,
    description: value.description,
    icon: value.icon,
    conditionType: value.conditionType,
    conditionValue: value.conditionValue,
    conditionParam: value.conditionParam,
    isActive: value.isActive,
  };
}

function ruleText(value: AdminAchievement) {
  const item = condition(value.conditionType);
  const difficulty =
    value.conditionType === 'difficulty_successes' &&
    value.conditionParam &&
    value.conditionParam in difficultyLabels
      ? ` · ${difficultyLabels[value.conditionParam as keyof typeof difficultyLabels]}`
      : '';
  return `${item.label}${difficulty} · ${value.conditionValue}`;
}

export function AdminAchievementsPage() {
  const [rows, setRows] = useState<AdminAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AdminAchievement | null>(null);
  const [form, setForm] = useState<AchievementForm>(EMPTY);
  const dialog = useRef<HTMLDialogElement>(null);

  const reload = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRows(await api<AdminAchievement[]>('/admin/achievements'));
    } catch (cause) {
      setLoadError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const stats = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((item) => item.isActive).length,
      archived: rows.filter((item) => !item.isActive).length,
      unlocked: rows.reduce((sum, item) => sum + item.unlockedUsers, 0),
    }),
    [rows],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setActionError('');
    setNotice('');
    dialog.current?.showModal();
  };
  const openEdit = (item: AdminAchievement) => {
    setEditing(item);
    setForm(fromAchievement(item));
    setActionError('');
    setNotice('');
    dialog.current?.showModal();
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      const payload = {
        ...form,
        conditionParam:
          form.conditionType === 'difficulty_successes' ? form.conditionParam ?? 'hard' : null,
      };
      if (editing)
        await api(`/admin/achievements/${editing.id}`, { method: 'PATCH', body: payload });
      else await api('/admin/achievements', { method: 'POST', body: payload });
      dialog.current?.close();
      setNotice(editing ? 'Достижение обновлено.' : 'Достижение создано.');
      await reload();
    } catch (cause) {
      setActionError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item: AdminAchievement) => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await api(`/admin/achievements/${item.id}`, {
        method: 'PATCH',
        body: { ...fromAchievement(item), isActive: !item.isActive },
      });
      setNotice(
        item.isActive
          ? 'Достижение отправлено в архив. Уже полученные награды сохранены.'
          : 'Достижение снова активно.',
      );
      await reload();
    } catch (cause) {
      setActionError(actionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page admin-achievements-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" /> Геймификация
          </p>
          <h1>Достижения</h1>
          <p>
            Управляйте целями без правок кода. Новые активные достижения проверяются по всей уже
            накопленной истории пользователей.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Icon name="plus" size={18} /> Новое достижение
        </Button>
      </div>

      <section className="admin-stat-grid admin-achievement-stats" aria-label="Статистика достижений">
        <article className="admin-stat-card">
          <span className="admin-stat-icon">
            <Icon name="award" />
          </span>
          <div>
            <span>Всего</span>
            <strong>{loading ? '—' : stats.total}</strong>
          </div>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-icon admin-stat-icon--green">
            <Icon name="check" />
          </span>
          <div>
            <span>Активны</span>
            <strong>{loading ? '—' : stats.active}</strong>
          </div>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-icon admin-stat-icon--muted">
            <Icon name="flag" />
          </span>
          <div>
            <span>В архиве</span>
            <strong>{loading ? '—' : stats.archived}</strong>
          </div>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-icon admin-stat-icon--orange">
            <Icon name="star" />
          </span>
          <div>
            <span>Получений</span>
            <strong>{loading ? '—' : stats.unlocked}</strong>
          </div>
        </article>
      </section>

      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {actionError && <p className="field-error" role="alert">{actionError}</p>}
      {loadError && <p className="field-error" role="alert">{loadError}</p>}
      {loading && <p role="status">Загружаем достижения…</p>}

      {!loading && !loadError && (
        <section className="panel achievement-admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Правила прогресса</p>
              <h2>Все достижения</h2>
            </div>
            <span>{rows.length}</span>
          </div>
          {!rows.length ? (
            <div className="admin-empty-state">
              <Icon name="award" size={26} />
              <h3>Достижений пока нет</h3>
              <p>Создайте первое правило и задайте условие его получения.</p>
              <Button onClick={openCreate}>Создать достижение</Button>
            </div>
          ) : (
            <div className="achievement-admin-list">
              {rows.map((item) => (
                <article className={`achievement-admin-row ${item.isActive ? '' : 'is-archived'}`} key={item.id}>
                  <span className="achievement-admin-icon">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <div className="achievement-admin-copy">
                    <div className="achievement-admin-title">
                      <h3>{item.title}</h3>
                      <span className={`status-pill ${item.isActive ? 'status-pill--published' : 'status-pill--archived'}`}>
                        {item.isActive ? 'Активно' : 'В архиве'}
                      </span>
                    </div>
                    <p>{item.description}</p>
                    <small>{ruleText(item)}</small>
                  </div>
                  <div className="achievement-admin-reach">
                    <strong>{item.unlockedUsers}</strong>
                    <span>получили</span>
                    <small>{item.unlockedPercent}% пользователей</small>
                  </div>
                  <div className="achievement-admin-actions">
                    <Button variant="outline" onClick={() => openEdit(item)} disabled={busy}>
                      <Icon name="edit" size={16} /> Изменить
                    </Button>
                    <Button variant="ghost" onClick={() => void toggleActive(item)} disabled={busy}>
                      <Icon name={item.isActive ? 'flag' : 'reset'} size={16} />
                      {item.isActive ? 'В архив' : 'Активировать'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <dialog
        ref={dialog}
        className="achievement-dialog"
        onCancel={() => {
          setActionError('');
          dialog.current?.close();
        }}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="achievement-dialog-heading">
            <div>
              <p className="eyebrow">{editing ? 'Редактирование' : 'Новое достижение'}</p>
              <h2>{editing ? editing.title : 'Настройте правило'}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Закрыть" onClick={() => dialog.current?.close()}>
              <Icon name="close" />
            </button>
          </div>

          <label className="field">
            Название
            <input
              value={form.title}
              maxLength={100}
              required
              onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
            />
          </label>
          <label className="field">
            Описание
            <textarea
              value={form.description}
              maxLength={300}
              required
              rows={3}
              onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
            />
          </label>

          <fieldset className="achievement-icon-picker">
            <legend>Иконка</legend>
            <div>
              {ACHIEVEMENT_ICON_NAMES.map((icon) => (
                <label key={icon} className={form.icon === icon ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="achievement-icon"
                    value={icon}
                    checked={form.icon === icon}
                    onChange={() => setForm((value) => ({ ...value, icon }))}
                  />
                  <Icon name={icon} size={19} />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="two-fields achievement-rule-fields">
            <label className="field">
              Тип условия
              <select
                value={form.conditionType}
                onChange={(event) => {
                  const conditionType = event.target.value as AchievementConditionType;
                  setForm((value) => ({
                    ...value,
                    conditionType,
                    conditionParam: conditionType === 'difficulty_successes' ? 'hard' : null,
                  }));
                }}
              >
                {ACHIEVEMENT_CONDITIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <small>{condition(form.conditionType).description}</small>
            </label>
            <label className="field">
              Целевое значение
              <input
                type="number"
                min={1}
                max={1_000_000}
                value={form.conditionValue}
                onChange={(event) =>
                  setForm((value) => ({ ...value, conditionValue: Number(event.target.value) }))
                }
              />
              <small>{condition(form.conditionType).unit}</small>
            </label>
          </div>

          {form.conditionType === 'difficulty_successes' && (
            <label className="field">
              Сложность сценария
              <select
                value={form.conditionParam ?? 'hard'}
                onChange={(event) =>
                  setForm((value) => ({ ...value, conditionParam: event.target.value }))
                }
              >
                <option value="easy">Начальный</option>
                <option value="medium">Средний</option>
                <option value="hard">Сложный</option>
              </select>
            </label>
          )}

          <label className="achievement-active-toggle">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((value) => ({ ...value, isActive: event.target.checked }))}
            />
            <span>
              <strong>Достижение активно</strong>
              <small>Активное правило автоматически проверяется по истории пользователей.</small>
            </span>
          </label>

          {actionError && <p className="field-error" role="alert">{actionError}</p>}
          <div className="achievement-dialog-actions">
            <Button type="button" variant="outline" onClick={() => dialog.current?.close()} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" disabled={busy || !form.title.trim() || !form.description.trim()}>
              {busy ? 'Сохраняем…' : editing ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
