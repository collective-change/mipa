const routes = [
  {
    path: "/",
    component: () => import("layouts/Layout.vue"),
    children: [
      { path: "", component: () => import("pages/PageOrgs.vue") },
      //{ path: "/teams", component: () => import("pages/PageTeams.vue") },
      //{ path: "/todo", component: () => import("pages/PageTodo.vue") },
      { path: "/settings", component: () => import("pages/PageSettings.vue") },
      { path: "/settings/help", component: () => import("pages/PageHelp.vue") },
      { path: "/auth", component: () => import("pages/PageAuth.vue") },
      {
        path: "/placeholder",
        component: () => import("pages/PagePlaceholder.vue")
      },
      {
        path: "/org/:orgNameSlug/model/:orgId/:modelId",
        name: "model",
        component: () => import("pages/PageModel.vue")
      },
      {
        path: "/org/:orgNameSlug/model/:orgId/:modelId/:nodeId",
        name: "model-node",
        component: () => import("pages/PageModel.vue")
      },
      {
        path: "/org/:orgNameSlug/model-bulk-update-nodes/:orgId/:modelId",
        name: "bulkUpdateNodes",
        component: () => import("pages/PageBulkUpdateNodes.vue")
      },
      {
        path: "/org/:orgNameSlug/ideate/actions/:orgId",
        name: "actions",
        component: () => import("pages/PageActions.vue")
      },
      {
        path: "/org/:orgNameSlug/achieve/my-todo/:orgId",
        name: "my-todo",
        component: () => import("pages/PageMyTodo.vue")
      },
      {
        path: "/org/:orgNameSlug/action-details/:orgId/:actionId",
        name: "actionDetails",
        component: () => import("pages/PageActionDetails.vue")
      }
    ]
  }
];

// Always leave this as last one
routes.push({
  path: "*",
  component: () => import("pages/Error404.vue")
});

export default routes;
