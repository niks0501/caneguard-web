import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { appRoutes } from "./appRoutes";

export function AppRouter() {
  const [router] = useState(() => createBrowserRouter(appRoutes));
  return <RouterProvider router={router} />;
}
