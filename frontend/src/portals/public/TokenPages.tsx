import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-6xl font-semibold text-plum-600">404</p>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <div className="mt-6 flex gap-4 text-sm font-semibold text-plum-700">
        <Link to="/admin">Staff</Link>
        <Link to="/b2b">Partners</Link>
        <Link to="/b2c">My Trips</Link>
      </div>
    </div>
  );
}
