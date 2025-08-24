import { redirect } from 'next/navigation';

export default function Page() {
  // Redirect /login -> /sign-in
  redirect('/sign-in');
}
