"use client";

import QRCode from "react-qr-code";

type MobileAuthQrProps = {
  url: string;
  title: string;
  description: string;
};

export function MobileAuthQr({ url, title, description }: MobileAuthQrProps) {
  return (
    <div className="mobile-auth-qr">
      <p className="mobile-auth-qr__title">{title}</p>
      <p className="hint">{description}</p>
      <div className="mobile-auth-qr__code" aria-hidden="true">
        <QRCode value={url} size={168} bgColor="#ffffff" fgColor="#0f172a" />
      </div>
      <a className="mobile-auth-qr__link" href={url}>
        Otwórz na urządzeniu mobilnym
      </a>
    </div>
  );
}
