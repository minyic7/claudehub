import { Outlet } from "react-router";
import Header from "./Header.js";

export default function Layout() {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
