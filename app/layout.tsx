import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Team workspace · Agent in the loop', description: 'A shared workspace for your team and their agents.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><head><link rel="alternate" type="text/plain" href="/llms.txt" title="Agent instructions"/></head><body>{children}</body></html>; }
