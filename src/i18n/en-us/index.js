export default {
  separationBetweenWords: " ",
  appTitle: "mipa",
  person: "person",
  people: "people",

  //for Layout.vue
  "Unread messages": "Unread messages",
  "No unread messages": "No unread messages",
  Notifications: "Notifications",
  Login: "Log in",
  Account: "Account",
  Home: "Home",
  home: "home",
  Settings: "Settings",
  Help: "Help",
  SendFeedback: "Send feedback",
  Logout: "Log out",
  About: "About",
  Copyright: "Copyright",
  "Contact us": "Contact us",
  Terms: "Terms",
  Privacy: "Privacy",
  "Policy & Safety": "Policy & Safety",

  // for PageAuth.vue and LoginRegister.vue
  authTagline:
    "Strategic coordination for organizations that want to succeed and help the world reach sustainability.",
  authPointModelTitle: "Model",
  authPointModelText:
    "Describe how your organization works as connected numbers, and simulate where it is heading.",
  authPointPrioritizeTitle: "Ideate and prioritize",
  authPointPrioritizeText:
    "Compare ideas by their benefits and costs to your organization and to the world, and see which give the most leverage.",
  authPointAchieveTitle: "Achieve",
  authPointAchieveText:
    "Agree on who is responsible, follow progress, and keep the discussion next to the work.",
  "Sign in": "Sign in",
  "Create account": "Create account",
  Email: "Email",
  Password: "Password",
  "At least 8 characters": "At least 8 characters",
  "Forgot password?": "Forgot password?",
  "Please enter a valid email address.": "Please enter a valid email address.",
  "Please enter at least 8 characters.": "Please enter at least 8 characters.",

  // for PageModel.vue
  Calculate: "Calculate",
  "Model settings": "Model settings",
  "Download results": "Download results",
  "Node groups": "Node groups",
  "Expand list": "Expand list",
  "Collapse list": "Collapse list",
  "Show all nodes in groups": "Show all nodes in groups",
  "Collapse all groups in the graph": "Collapse all groups in the graph",
  noNodeGroupsHint:
    "To group nodes, right-click a node and choose 'Start node group'. Then add more nodes to it.",

  // for store-calculator.js
  "Calculation finished": "Calculation finished",

  // for PageSettings.vue and PageHelp.vue
  "Visit our website": "Visit our website",
  "Report a problem or suggest an idea": "Report a problem or suggest an idea",
  "Source code": "Source code",
  helpTitle: "Getting started with mipa",
  helpIntro:
    "mipa helps an organization decide what to do next by estimating how much each idea would benefit the organization and the world, compared with what it costs.",
  helpOrgTitle: "1. Add your organization",
  helpOrgText:
    "On My dashboard, choose Add organization and enter its name, goal and currency. mipa creates a model for it with starter nodes for effort, spending, and the costs and benefits to the organization and to the world.",
  helpModelTitle: "2. Build the model",
  helpModelText:
    "Open Model. Each circle is a node: a number such as monthly sales or emissions. Click a node to edit its formula and unit. Formulas can use other nodes by their symbol, and delay(node, dt, 0) gives a node's previous value, so you can build up totals over time.\n\nStart with the node marked (new): set the average cost of an hour of work. Use Add node for more, and Model settings for the time step and how far ahead to simulate. Then choose Calculate.",
  helpActionsTitle: "3. Add and compare actions",
  helpActionsText:
    "Open Actions and choose Add. Describe the idea, estimate the hours and money it needs, and add its impacts: which nodes it changes, by how much and for how long. Choose Recalculate, and mipa simulates the model with and without each action.\n\nActions are ranked by leverage: how much net benefit, to the organization and to the world, each hour of effort buys. Start with the actions at the top.",
  helpAchieveTitle: "4. Get it done",
  helpAchieveText:
    "Give each action a responsible and an accountable person, and move it through its states as it is approved and completed. My to-do lists the actions you are responsible for. Every node and action has a chat, so the discussion stays next to the work.",
  helpMore: "Something unclear or not working?",

  // for PagePrivacy.vue
  privacyEnglishOnly: "This policy is currently available in English only.",

  // for organization members
  Members: "Members",
  Member: "Member",
  Admin: "Admin",
  Role: "Role",
  you: "you",
  Invite: "Invite",
  "Invite someone": "Invite someone",
  inviteHelp:
    "They will see the invitation on their dashboard when they sign in to mipa with this email address, and can accept or decline it. Admins can invite and remove members and change roles.",
  "Waiting for a reply": "Waiting for a reply",
  Withdraw: "Withdraw",
  "Member options": "Member options",
  "Make admin": "Make admin",
  "Remove admin role": "Remove admin role",
  "Leave organization": "Leave organization",
  "Remove from organization": "Remove from organization",
  leaveConfirm: "Leave {name}? You will lose access to its models, actions and chats.",
  removeConfirm: "Remove {name} from the organization? They will lose access to its models, actions and chats.",
  alreadyMember: "This person is already a member.",
  "Invitation created": "Invitation created",
  Invitations: "Invitations",
  invitedBy: "{name} invited you to join as {role}",
  Accept: "Accept",
  Decline: "Decline",
  "Decline invitation": "Decline invitation",
  declineInvitationConfirm: "Decline the invitation to join {name}?",
  "You joined the organization": "You joined the organization",
  verifyEmailToAccept:
    "To accept an invitation, please verify your email address first. We sent you a link when you registered; you can send a new one.",
  "Send verification email": "Send verification email",
  "I have verified my email": "I have verified my email",
  "Verification email sent": "Verification email sent",
  emailNotVerifiedYet: "Your email isn't verified yet. Please click the link in the email first.",
  "Something went wrong": "Something went wrong",

  // for PageOrgs.vue
  "My organizations": "My organizations",
  "Add organization": "Add organization",
  noOrgsTitle: "Start with your organization",
  noOrgsText:
    "An organization is a group of people with a goal: a business, a non-profit, a school project, or just you. Add one to model how it works, compare actions by their benefit to you and to the world, and track who is doing what.",

  // for OrgCard.vue
  "Edit organization": "Edit organization",
  "Delete organization": "Delete organization",
  deleteOrgConfirm: "Delete {name} and everything in it? This cannot be undone.",

  // for linkGroups
  "My dashboard": "My dashboard",
  "To do": "To do",
  Organization: "Organization",
  "Basic information": "Basic information",

  Users: "Users",
  Structure: "Structure",
  Suppliers: "Suppliers",
  Purchases: "Purchases",
  Metrics: "Metrics",
  Frameworks: "Frameworks",

  ModelVerb: "Model",
  ModelNoun: "Model",
  model: "model",
  Units: "Units",
  "Bulk update": "Bulk update",
  Analysis: "Analysis",
  "Model templates": "Templates",

  Ideate: "Ideate",
  ideate: "ideate",
  "Strategic analysis": "Strategic analysis",
  Actions: "Actions",
  actions: "actions",
  "Action templates": "Action templates",

  Prioritize: "Prioritize",
  prioritize: "prioritize",
  Priorities: "Priorities",
  "Resource allocation": "Resource allocation",
  Roadmap: "Roadmap",

  Achieve: "Achieve",
  achieve: "achieve",
  "My current focus": "My current focus",
  "My todo": "My to-do",
  "Time log": "Time log",
  "My team's work": "My team's work",

  // action states
  initiating: "initiating",
  to_approve: "to approve",
  rejected: "rejected",
  eligible: "eligible",
  approved: "approved",
  done: "done",
  cancellation_requested: "cancellation requested",
  canceled: "canceled",

  //action trigger button labels
  "Request approval": "Request approval",
  "Approval needed": "Approval needed",
  "Approval not needed": "Approval not needed",
  Approve: "Approve",
  Reject: "Reject",
  Cancel: "Cancel",
  "Mark as done": "Mark as done",
  "Re-approval needed": "Re-approval needed",
  "Request to cancel": "Request to cancel",
  "Revert to eligible": "Revert to eligible",
  "Reject cancellation": "Reject cancellation",
  "Approve cancellation": "Approve cancellation",
  Revive: "Revive",

  // for ActionsList.vue
  Add: "Add",
  Recalculate: "Recalculate",
  Leverage: "Leverage",
  State: "State",
  Title: "Title",
  "Responsible, accountable": "Responsible, accountable",
  isProject: "Is project",
  marginalTotalBenefitNpv: "Total benefit",
  marginalTotalCostNpv: "Total cost",
  marginalNetTotalBenefitNpv: "Net total benefit",
  outstandingDirectCost: "Outstanding direct cost",
  totalRoi: "Total ROI",
  effortCompletionPercentage: "Effort completion",
  relationships: "Relationships",
  dueDate: "Due date",

  // for ActionSummary.vue
  Notes: "Notes",
  effortCostPerHour: "Effort cost per hour",
  customEffortCostPerHr: "Custom effort cost per hour",
  estEffortHrs: "Estimated hours",
  percentDone: "% done",
  estSpending: "Estimated spending",
  spentAmount: "Spent amount",

  // for ActionRelationships.vue
  "(some action)": "(some action)"
};
