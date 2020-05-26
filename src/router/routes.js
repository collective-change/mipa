const routes = [
  {
    path: "/",
    component: () => import("layouts/Layout.vue"),
    children: [
      { path: "", component: () => import("pages/PageOrgs.vue") },
      { path: "/teams", component: () => import("pages/PageTeams.vue") },
      //{ path: "", component: () => import("pages/PageHome.vue") },
      { path: "/todo", component: () => import("pages/PageTodo.vue") },
      { path: "/settings", component: () => import("pages/PageSettings.vue") },
      { path: "/settings/help", component: () => import("pages/PageHelp.vue") },
      { path: "/auth", component: () => import("pages/PageAuth.vue") },
      {
        path: "/placeholder",
        component: () => import("pages/PagePlaceholder.vue")
      },
      {
        path: "/org/:orgName/model/:orgId/:modelId",
        component: () => import("pages/PageModel.vue")
      },
      {
        path: "/org/:orgName/ideate/:orgId",
        component: () => import("pages/PageIssues.vue")
      }
    ]
  }
];

// Always leave this as last one
if (process.env.MODE !== "ssr") {
  routes.push({
    path: "*",
    component: () => import("pages/Error404.vue")
  });
}

export default routes;
