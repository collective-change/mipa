<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-white text-grey-8 q-py-none print-hide">
      <q-toolbar>
        <div class="text-h6">{{ orgName }}</div>
        <q-btn
          flat
          no-caps
          no-wrap
          class="q-ml-xs"
          v-if="$q.screen.gt.xs"
          clickable
          to="/"
        >
          <q-toolbar-title shrink class="text-weight-bold text-primary"
            >mipa</q-toolbar-title
          >
        </q-btn>
        <q-btn-dropdown
          v-if="currentOrg"
          dense
          flat
          :label="$t(currentLinkGroup)"
        >
          <q-list>
            <div v-for="(linkGroup, key) in linkGroups" v-bind:key="key">
              <q-separator class="q-my-xs" />
              <q-item class="q-py-none">
                <q-item-section avatar class="q-py-none">
                  <q-icon
                    color="grey"
                    :name="linkGroup.icon"
                    :class="linkGroup.icon_class"
                  />
                </q-item-section>
                <q-item-section class="q-py-none">
                  <q-item-label>{{ linkGroup.text }}</q-item-label>
                </q-item-section>
              </q-item>
              <q-btn-group flat unelevated>
                <q-btn
                  v-for="link in linkGroup.links"
                  :key="link.text"
                  v-ripple
                  clickable
                  no-caps
                  v-close-popup
                  :to="link.to"
                >
                  <q-item-section>
                    <q-item-section avatar>
                      <q-icon
                        color="grey"
                        :name="link.icon"
                        :class="link.icon_class"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ link.text }}</q-item-label>
                    </q-item-section>
                  </q-item-section>
                </q-btn>
              </q-btn-group>
            </div>
          </q-list>
        </q-btn-dropdown>

        <q-tabs v-if="linkGroups[currentLinkGroup]" align="left" no-caps>
          <q-route-tab
            v-for="link in linkGroups[currentLinkGroup].links"
            :key="link.text"
            :to="link.to"
            :label="link.text"
          />
        </q-tabs>

        <q-space />

        <div class="q-gutter-sm row items-center no-wrap">
          <q-btn v-if="loggedIn" round dense flat color="grey-8" icon="message">
            <q-tooltip>{{ $t("Messages") }}</q-tooltip>
          </q-btn>
          <q-btn
            v-if="loggedIn"
            round
            dense
            flat
            color="grey-8"
            icon="notifications"
          >
            <q-badge color="red" text-color="white" floating>2</q-badge>
            <q-tooltip>{{ $t("Notifications") }}</q-tooltip>
          </q-btn>

          <q-btn
            v-if="!loggedIn"
            to="/auth"
            flat
            icon-right="account_circle"
            :label="$t('Login')"
          />
          <q-btn
            v-else
            flat
            icon-right="account_circle"
            @click="rightDrawerOpen = !rightDrawerOpen"
          >
            <q-tooltip>{{ $t("Account") }}</q-tooltip>
          </q-btn>

          <q-select
            v-model="lang"
            :options="langOptions"
            dense
            borderless
            emit-value
            map-options
            options-dense
            style="min-width: 80px"
          >
            <template v-slot:prepend>
              <q-icon name="language" />
            </template>
          </q-select>
        </div>
      </q-toolbar>
    </q-header>

    <q-drawer
      side="right"
      v-model="rightDrawerOpen"
      bordered
      content-class="bg-grey-2"
      :width="240"
      class="print-hide"
    >
      <q-scroll-area class="fit">
        <q-list padding>
          <q-item
            v-for="link in links1"
            :key="link.text"
            v-ripple
            clickable
            :to="link.to"
            exact
          >
            <q-item-section avatar>
              <q-icon color="grey" :name="link.icon" :class="link.icon_class" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t(link.text) }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator class="q-my-md" />

          <q-item
            v-for="link in links2"
            :key="link.text"
            v-ripple
            clickable
            :to="link.to"
            exact
          >
            <q-item-section avatar>
              <q-icon color="grey" :name="link.icon" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t(link.text) }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-item
            v-for="link in links3"
            :key="link.text"
            v-ripple
            clickable
            v-on:click="logoutUser"
          >
            <q-item-section avatar>
              <q-icon color="grey" :name="link.icon" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t(link.text) }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator class="q-mt-md q-mb-lg" />

          <div class="q-px-md text-grey-9">
            <div class="row items-center q-gutter-x-sm q-gutter-y-xs">
              <a
                v-for="button in buttons1"
                :key="button.text"
                class="drawer-footer-link"
                href="javascript:void(0)"
                >{{ $t(button.text) }}</a
              >
            </div>
          </div>
          <div class="q-py-md q-px-md text-grey-9">
            <div class="row items-center q-gutter-x-sm q-gutter-y-xs">
              <a
                v-for="button in buttons2"
                :key="button.text"
                class="drawer-footer-link"
                href="javascript:void(0)"
                >{{ $t(button.text) }}</a
              >
            </div>
          </div>
          <div class="q-py-md q-px-md text-grey-9">
            <div class="row items-center q-gutter-x-sm q-gutter-y-xs">
              User id: {{ userId }}
            </div>
          </div>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script>
import { mapState, mapActions } from "vuex";
import { openURL } from "quasar";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
import { version } from "../../package.json";

export default {
  name: "MyLayout",
  data() {
    return {
      userId: null,
      lang: this.$i18n.locale,
      langOptions: [
        { value: "en-us", label: "English" },
        { value: "zh-tw", label: "中文" }
      ],
      versionFromPackageJson: version,

      rightDrawerOpen: false, //this.$q.platform.is.desktop,

      links1: [{ icon: "home", text: "Home", to: "/" }],
      links2: [
        { icon: "settings", text: "Settings", to: "/settings" },
        { icon: "help", text: "Help", to: "/settings/help" },
        { icon: "feedback", text: "SendFeedback" }
      ],
      links3: [{ icon: "exit_to_app", text: "Logout", onclick: "logoutUser" }],
      buttons1: [
        { text: "About" },
        { text: "Copyright" },
        { text: "Contact us" }
      ],
      buttons2: [
        { text: "Terms" },
        { text: "Privacy" },
        { text: "Policy & Safety" }
      ]
    };
  },
  computed: {
    ...mapState("auth", ["loggedIn"]),
    ...mapState("model", ["currentModel"]),
    ...mapState("orgs", ["orgs", "currentOrg"]),
    ...mapState("adHocDocs", ["exchangeRates"]),

    currentRoute() {
      return this.$route.path;
    },

    orgId() {
      return this.currentOrg ? this.currentOrg.id : "unknownOrgId";
    },

    orgName() {
      return this.currentOrg ? this.currentOrg.name : "";
    },

    orgGoal() {
      return this.currentOrg ? this.currentOrg.goal : "";
    },

    orgNameSlug() {
      return this.currentOrg ? this.currentOrg.nameSlug : "unknownOrgNameSlug";
    },

    modelId() {
      return this.currentModel ? this.currentModel.id : this.orgId;
    },

    linkGroups() {
      return {
        home: {
          text: this.$t("Home"),
          icon: "home",
          links: [
            { text: this.$t("My dashboard"), to: "/" },
            { text: this.$t("To do"), to: "/todo" }
          ]
        },
        organization: {
          text: this.$t("Organization"),
          icon: "people",
          links: [
            {
              text: this.$t("Basic information"),
              to: "/organization/basic-info"
            },
            { text: this.$t("Users"), to: "/organization/users" },
            {
              text: this.$t("Structure and permissions"),
              to: "/organizations/structure-and-permissions"
            },
            {
              text: this.$t("Performance and certification"),
              to: "/organization/performance-and-certification"
            }
          ]
        },
        model: {
          text: this.$t("ModelVerb"),
          icon: "share",
          icon_class: "flip-horizontal",
          links: [
            {
              text: this.$t("ModelNoun"),
              to: `/org/${this.orgNameSlug}/model/${this.orgId}/${this.modelId}`
            },
            { text: this.$t("Units"), to: "/placeholder" },
            { text: this.$t("Update values"), to: "/placeholder" },
            { text: this.$t("Analysis"), to: "/placeholder" },
            { text: this.$t("Model templates"), to: "/placeholder" }
          ]
        },
        ideate: {
          text: this.$t("Ideate"),
          icon: "wb_incandescent",
          icon_class: "flip-vertical",
          links: [
            { text: this.$t("Strategic analysis"), to: "/placeholder" },
            {
              text: this.$t("Actions"),
              //to: `/org/${this.orgNameSlug}/actions/${this.orgId}`
              to: {
                name: "actions",
                params: { orgNameSlug: this.orgNameSlug, orgId: this.orgId }
              }
            },
            { text: this.$t("Action templates"), to: "/placeholder" }
          ]
        },
        prioritize: {
          text: this.$t("Prioritize"),
          icon: "poll",
          links: [
            { text: this.$t("Priorities"), to: "/placeholder" },
            { text: this.$t("Resource allocation"), to: "/placeholder" },
            { text: this.$t("Roadmap"), to: "/placeholder" }
          ]
        },
        achieve: {
          text: this.$t("Achieve"),
          icon: "whatshot",
          links: [
            { text: this.$t("My current focus"), to: "/placeholder" },
            { text: this.$t("To do"), to: "/placeholder" },
            { text: this.$t("Time log"), to: "/placeholder" },
            { text: this.$t("My team's work"), to: "/placeholder" }
          ]
        }
      };
    },

    currentLinkGroup() {
      if (this.$route.path == "/" || this.$route.path == "/todo") {
        return "home";
      } else if (this.$route.path.includes("organization")) {
        return "organization";
      } else if (this.$route.path.includes("model")) {
        return "model";
      } else if (this.$route.path.includes("ideate")) {
        return "ideate";
      } else if (this.$route.path.includes("prioritize")) {
        return "prioritize";
      } else if (this.$route.path.includes("achieve")) {
        return "achieve";
      } else {
        return "home";
      }
    }
  },
  methods: {
    ...mapActions("auth", ["logoutUser"]),
    openURL,
    onItemClick() {
      console.log("Clicked on an Item");
      console.log("currentroute", this.$route);
    },
    bindPublicData() {
      this.$store.dispatch("adHocDocs/bindExchangeRates");
    },
    unbindPublicData() {
      this.$store.dispatch("adHocDocs/unbindExchangeRates");
    },
    bindMinimalOrgRelatedData(orgId) {
      this.$store.dispatch("orgs/bindCurrentOrg", orgId);
    },
    unbindAllOrgRelatedData() {
      this.$store.dispatch("orgs/unbindCurrentOrg");
      this.$store.dispatch("actions/unbindActions");
      this.$store.dispatch("model/unbindCurrentModel");
      this.$store.dispatch("model/unbindNodes");
      //this.$store.dispatch("calcResults/unbindBaseline");
    }
  },
  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      ) {
        //console.log("waiting for currentUser to be defined");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.bindPublicData();
      this.userId = firebaseAuth.currentUser.uid;
      let orgId = this.$route.params.orgId;
      if (orgId) {
        this.bindMinimalOrgRelatedData(orgId);
      }
    })();
  },
  mounted() {
    if (this.$q.cookies.has("locale")) {
      this.lang = this.$q.cookies.get("locale");
    } else this.lang = this.$q.lang.getLocale();
  },
  beforeDestroy() {
    this.unbindAllOrgRelatedData();
    this.unbindPublicData();
  },
  watch: {
    $route(newRoute, oldRoute) {
      let newOrgId = "orgId" in newRoute.params ? newRoute.params.orgId : "";
      let oldOrgId = "orgId" in oldRoute.params ? oldRoute.params.orgId : "";

      if (newOrgId != oldOrgId && newOrgId != "") {
        this.bindMinimalOrgRelatedData(newOrgId);
      }
      if (newOrgId == "") {
        this.unbindAllOrgRelatedData();
      }
    },

    lang(lang) {
      this.$i18n.locale = lang;
      this.$q.cookies.set("locale", lang, {
        sameSite: "None",
        secure: true,
        expires: 36525
      });
      document.title = this.$t("appTitle");
    }
  }
};
</script>

<style lang="scss">
.q-toolbar {
  min-height: 48px;
}
.q-btn-dropdown {
  .q-router-link--exact-active {
    color: blue !important;
  }
}

.drawer-footer-link {
  color: inherit;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.75rem;

  &:hover {
    color: #000;
  }
}
</style>
