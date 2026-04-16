import { ClerkProvider } from "@clerk/nextjs";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function ClerkLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!clerkPublishableKey) {
    return children;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {children}
    </ClerkProvider>
  );
}
