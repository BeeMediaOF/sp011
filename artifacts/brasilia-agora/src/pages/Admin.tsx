import React, { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import Login from "./admin/Login";
import Dashboard from "./admin/Dashboard";
import Articles from "./admin/Articles";
import ArticleEdit from "./admin/ArticleEdit";
import MenuManager from "./admin/MenuManager";
import LogoUpload from "./admin/LogoUpload";
import Settings from "./admin/Settings";
import Webhook from "./admin/Webhook";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("admin_token");

  useEffect(() => {
    if (!token) navigate("/admin/login");
  }, [token, navigate]);

  if (!token) return null;
  return <>{children}</>;
}

export default function Admin() {
  return (
    <Switch>
      <Route path="/admin/login" component={Login} />
      <Route path="/admin/artigos/novo">
        <RequireAuth><ArticleEdit /></RequireAuth>
      </Route>
      <Route path="/admin/artigos/:id">
        <RequireAuth><ArticleEdit /></RequireAuth>
      </Route>
      <Route path="/admin/artigos">
        <RequireAuth><Articles /></RequireAuth>
      </Route>
      <Route path="/admin/menu">
        <RequireAuth><MenuManager /></RequireAuth>
      </Route>
      <Route path="/admin/logo">
        <RequireAuth><LogoUpload /></RequireAuth>
      </Route>
      <Route path="/admin/configuracoes">
        <RequireAuth><Settings /></RequireAuth>
      </Route>
      <Route path="/admin/webhook">
        <RequireAuth><Webhook /></RequireAuth>
      </Route>
      <Route path="/admin">
        <RequireAuth><Dashboard /></RequireAuth>
      </Route>
    </Switch>
  );
}
