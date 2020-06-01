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
        path: "/org/:orgNameSlug/model/:orgId/:modelId",
        component: () => import("pages/PageModel.vue")
      },
      {
        path: "/org/:orgNameSlug/issues/:orgId",
        name: "issues",
        component: () => import("pages/PageIssues.vue")
      },
      {
        path: "/org/:orgNameSlug/issue/:orgId/:issueId",
        name: "issueDetails",
        component: () => import("pages/PageIssueDetails.vue")
      },
      {
        path: "/org/:orgNameSlug/actions/:orgId",
        name: "actions",
        component: () => import("pages/PageActions.vue")
      },
      {
        path: "/org/:orgNameSlug/action/:orgId/:actionId",
        name: "actionDetails",
        component: () => import("pages/PageActionDetails.vue")
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
