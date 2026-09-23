import type { Metadata } from "next"

// The page itself is a client component, so its title lives here.
export const metadata: Metadata = { title: "Mess · Sign In" }

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children
}
