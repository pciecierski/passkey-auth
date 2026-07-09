import Image from "next/image";

type AppLogoProps = {
  size?: number;
};

export function AppLogo({ size = 88 }: AppLogoProps) {
  return (
    <div className="app-logo">
      <Image
        src="/logo.png"
        alt="DC LOG"
        width={size}
        height={size}
        priority
      />
    </div>
  );
}
