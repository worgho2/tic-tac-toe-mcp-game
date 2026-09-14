import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'primary', className = '', type = 'button', ref, ...rest }: Props) {
  return <button type={type} ref={ref} className={`btn btn--${variant} ${className}`.trim()} {...rest} />;
}
