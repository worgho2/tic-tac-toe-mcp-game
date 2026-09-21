import type { AnchorHTMLAttributes, MouseEvent } from 'react';

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  href: string;
  /** Opens the URL through the host; hosts sandbox the iframe, so a plain navigation may do nothing. */
  onOpen: (url: string) => void;
}

/** External link: a real anchor (hover shows the URL, it can be copied) whose click is routed to `onOpen`. */
export function Link({ href, onOpen, className = '', ...rest }: Props) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onOpen(href);
  };
  return (
    <a className={`link ${className}`.trim()} href={href} target="_blank" rel="noreferrer" onClick={open} {...rest} />
  );
}
