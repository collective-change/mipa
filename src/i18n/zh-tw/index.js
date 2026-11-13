export default {
  separationBetweenWords: "",
  appTitle: "mipa",
  person: "人",
  people: "人",

  //for Layout.vue
  "Unread messages": "未讀訊息",
  "No unread messages": "沒有未讀訊息",
  Notifications: "通知",
  Login: "登入",
  Account: "帳戶",
  Home: "首頁",
  home: "首頁",
  Settings: "設定",
  Help: "協助",
  SendFeedback: "回饋",
  Logout: "登出",
  About: "關於",
  Copyright: "著作權",
  "Contact us": "聯絡我們",
  Terms: "條款",
  Privacy: "隱私",
  "Policy & Safety": "政策與安全",

  // for PageAuth.vue and LoginRegister.vue
  authTagline: "為想要成功、也想幫助世界邁向永續的組織，提供策略協作。",
  authPointModelTitle: "建模",
  authPointModelText: "把組織的運作描述成相互連結的數字，模擬它未來的走向。",
  authPointPrioritizeTitle: "發想與排序",
  authPointPrioritizeText: "比較各個點子對組織和世界的效益與成本，找出槓桿最大的行動。",
  authPointAchieveTitle: "達成",
  authPointAchieveText: "確認誰負責什麼、追蹤進度，並讓討論緊貼著工作本身。",
  "Sign in": "登入",
  "Create account": "建立帳號",
  Email: "電子郵件",
  Password: "密碼",
  "At least 8 characters": "至少 8 個字元",
  "Forgot password?": "忘記密碼？",
  "Please enter a valid email address.": "請輸入有效的電子郵件地址。",
  "Please enter at least 8 characters.": "請至少輸入 8 個字元。",

  // for PageModel.vue
  Calculate: "計算",
  "Model settings": "模型設定",
  "Download results": "下載結果",
  "Node groups": "節點群組",
  "Expand list": "展開清單",
  "Collapse list": "收合清單",
  "Show all nodes in groups": "顯示群組中的所有節點",
  "Collapse all groups in the graph": "收合圖中的所有群組",
  noNodeGroupsHint:
    "要把節點分組，請在節點上按右鍵，選擇「Start node group」，再把其他節點加進去。",

  // for store-calculator.js
  "Calculation finished": "計算完成",

  // for PageSettings.vue and PageHelp.vue
  "Visit our website": "造訪我們的網站",
  "Report a problem or suggest an idea": "回報問題或提出建議",
  "Source code": "原始碼",
  helpTitle: "開始使用 mipa",
  helpIntro: "mipa 估計每個點子對組織和世界的效益，並與它的成本相比，幫助組織決定下一步要做什麼。",
  helpOrgTitle: "1. 新增你的組織",
  helpOrgText:
    "在「我的儀錶板」選擇「新增組織」，輸入名稱、目標和幣別。mipa 會為它建立一個模型，內含工時、支出，以及對組織和世界的成本與效益等起始節點。",
  helpModelTitle: "2. 建立模型",
  helpModelText:
    "打開「模型」。每個圓圈都是一個節點，代表一個數字，例如每月銷售額或排放量。點選節點即可編輯它的公式和單位。公式可以用符號引用其他節點，delay(節點, dt, 0) 則會取得節點的前一個值，讓你累積隨時間變化的總量。\n\n先處理標示 (new) 的節點：設定每小時工作的平均成本。用「ADD NODE」新增節點，用「模型設定」調整時間步長和模擬期間，然後按「計算」。",
  helpActionsTitle: "3. 新增並比較行動",
  helpActionsText:
    "打開「行動」並選擇「新增」。描述這個點子，估計所需的工時和金錢，並加入它的影響：會改變哪些節點、改變多少、持續多久。按「重新計算」，mipa 會分別模擬做與不做每個行動的結果。\n\n行動依槓桿排序：每一小時的投入，能為組織和世界帶來多少淨效益。從排在最前面的行動開始。",
  helpAchieveTitle: "4. 付諸實行",
  helpAchieveText:
    "為每個行動指定負責人和當責人，並隨著核准與完成推進它的狀態。「待辦」會列出由你負責的行動。每個節點和行動都有聊天室，讓討論緊貼著工作本身。",
  helpMore: "有不清楚或無法運作的地方嗎？",

  // for PagePrivacy.vue
  privacyEnglishOnly: "本隱私權政策目前僅提供英文版本。",

  // for PageOrgs.vue
  "My organizations": "我的組織",
  "Add organization": "新增組織",
  noOrgsTitle: "從你的組織開始",
  noOrgsText:
    "組織是一群有共同目標的人：企業、非營利組織、學校專題，或只是你自己。新增組織後，你可以建立它的運作模型、比較各項行動對組織和世界的效益，並追蹤每個人負責的工作。",

  // for OrgCard.vue
  "Edit organization": "編輯組織",
  "Delete organization": "刪除組織",
  deleteOrgConfirm: "確定要刪除「{name}」及其所有內容嗎？此動作無法復原。",

  //for linkGroups
  "My dashboard": "我的儀錶板",
  "To do": "待辦事項",
  Organization: "組織",
  "Basic information": "基本資料",

  Users: "使用者",
  Structure: "組織架構",
  Suppliers: "供應商",
  Purchases: "採購",
  Metrics: "績效指標",
  Frameworks: "管理框架",

  ModelVerb: "發展模型",
  ModelNoun: "模型",
  model: "發展模型",
  Units: "計量單位",
  "Bulk update": "批量更新",
  Analysis: "分析",
  "Model templates": "模型模板",

  Ideate: "醞釀計畫",
  ideate: "醞釀計畫",
  "Strategic analysis": "策略性分析",
  Actions: "行動",
  actions: "行動",
  "Action templates": "行動模板",

  Prioritize: "訂出優先",
  prioritize: "訂出優先",
  Priorities: "優先事項",
  "Resource allocation": "資源安排",
  Roadmap: "路徑圖",

  Achieve: "協調執行",
  achieve: "協調執行",
  "My current focus": "我的焦聚",
  "My todo": "待辦",
  "Time log": "時間紀錄",
  "My team's work": "小組的工作",

  // action states
  initiating: "發起中",
  to_approve: "待授權",
  rejected: "被退回",
  eligible: "可進行",
  approved: "已核准",
  done: "已完成",
  cancellation_requested: "請求取消中",
  canceled: "已取消",

  //action trigger button labels
  "Request approval": "請求授權",
  "Approval needed": "需要授權",
  "Approval not needed": "不需授權",
  Approve: "授權",
  Reject: "退回",
  Cancel: "取消",
  "Mark as done": "標為已完成",
  "Re-approval needed": "需重新授權",
  "Request to cancel": "請求取消",
  "Revert to eligible": "恢復為可進行",
  "Reject cancellation": "不同意取消",
  "Approve cancellation": "同意取消",
  Revive: "恢復",

  // for ActionsList.vue
  Add: "新增",
  Recalculate: "重新計算",
  Leverage: "效應比",
  State: "狀態",
  Title: "標題",
  "Responsible, accountable": "負責, 當責",
  isProject: "專案",
  marginalTotalBenefitNpv: "總邊際效益",
  marginalTotalCostNpv: "總邊際成本",
  marginalNetTotalBenefitNpv: "總淨邊際效益",
  outstandingDirectCost: "需再投入直接成本",
  totalRoi: "總 ROI",
  effortCompletionPercentage: "完成度",
  relationships: "關係",
  dueDate: "截止日期",

  // for ActionSummary.vue
  Notes: "筆記",
  effortCostPerHour: "每小時人員成本",
  customEffortCostPerHr: "特殊每小時人員成本",
  estEffortHrs: "預估人員時間",
  percentDone: "% 完成",
  estSpending: "預估支出金額",
  spentAmount: "已支出金額",

  // for ActionRelationships.vue
  "(some action)": "(某行動)"
};
