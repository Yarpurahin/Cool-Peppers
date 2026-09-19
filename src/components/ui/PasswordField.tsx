import { useId, useState } from 'react';
import { Icon } from './Icon.tsx';

export function PasswordField({
  label = 'Пароль',
  name = 'password',
  newPassword = false,
}: {
  label?: string;
  name?: string;
  newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={newPassword ? 8 : undefined}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          placeholder={newPassword ? 'Не менее 8 символов' : 'Введите пароль'}
        />
        <button
          type="button"
          aria-label={`${visible ? 'Скрыть' : 'Показать'}: ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={19} />
        </button>
      </div>
    </div>
  );
}
