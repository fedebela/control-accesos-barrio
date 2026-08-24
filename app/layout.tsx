import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Control de Accesos - Barrio Privado",
  description: "Sistema de control de accesos para barrio privado",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", backgroundColor: "#f1f5f9" }}>
        {children}
      </body>
    </html>
  );
}
