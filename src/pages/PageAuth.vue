<template>
  <q-page padding class="auth-page">
    <div class="row q-col-gutter-xl items-center justify-center auth-content">
      <div class="col-12 col-md-6 intro">
        <div class="text-h3 text-weight-bold text-primary">mipa</div>
        <div class="text-h6 q-mt-sm text-grey-9">{{ $t("authTagline") }}</div>
        <q-list class="q-mt-lg">
          <q-item v-for="point in points" :key="point.title" class="q-px-none">
            <q-item-section avatar top>
              <q-avatar
                :icon="point.icon"
                color="blue-1"
                text-color="primary"
                :class="point.iconClass"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-subtitle1 text-weight-medium">
                {{ $t(point.title) }}
              </q-item-label>
              <q-item-label caption class="text-body2 text-grey-8">
                {{ $t(point.text) }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <div class="col-12 col-md-5">
        <q-card class="auth-card">
          <q-tabs
            v-model="tab"
            class="text-grey-7"
            active-color="primary"
            indicator-color="primary"
            align="justify"
            no-caps
          >
            <q-tab name="login" :label="$t('Sign in')" />
            <q-tab name="register" :label="$t('Create account')" />
          </q-tabs>
          <q-separator />
          <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="login">
              <login-register tab="login" />
            </q-tab-panel>
            <q-tab-panel name="register">
              <login-register tab="register" />
            </q-tab-panel>
          </q-tab-panels>
        </q-card>
        <div class="text-center text-caption text-grey-7 q-mt-md">
          <router-link to="/privacy" class="text-grey-7">{{ $t("Privacy") }}</router-link>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import LoginRegister from "@/components/Auth/LoginRegister.vue";
export default {
  data() {
    return {
      tab: "login",
      points: [
        {
          icon: "share",
          iconClass: "rotate-90",
          title: "authPointModelTitle",
          text: "authPointModelText"
        },
        {
          icon: "poll",
          title: "authPointPrioritizeTitle",
          text: "authPointPrioritizeText"
        },
        {
          icon: "checklist",
          title: "authPointAchieveTitle",
          text: "authPointAchieveText"
        }
      ]
    };
  },
  components: {
    "login-register": LoginRegister
  }
};
</script>

<style scoped>
.auth-content {
  max-width: 1080px;
  margin: 0 auto;
  min-height: calc(100vh - 120px);
}
.auth-card {
  max-width: 440px;
  margin: 0 auto;
}
.intro {
  max-width: 520px;
}
</style>
