<template>
  <div>
    <q-form @submit.prevent="submitForm" class="q-gutter-y-md">
      <q-input
        outlined
        v-model="formData.email"
        ref="email"
        :rules="[(val) => isValidEmailAddress(val) || $t('Please enter a valid email address.')]"
        lazy-rules
        :label="$t('Email')"
        type="email"
        autocomplete="email"
        name="email"
      />
      <q-input
        outlined
        v-model="formData.password"
        ref="password"
        :rules="[
          (val) =>
            tab == 'login'
              ? !!val || $t('Required')
              : (val && val.length >= 8) || $t('Please enter at least 8 characters.')
        ]"
        lazy-rules
        :type="showPassword ? 'text' : 'password'"
        :label="$t('Password')"
        :hint="tab == 'register' ? $t('At least 8 characters') : undefined"
        :autocomplete="tab == 'register' ? 'new-password' : 'current-password'"
        name="password"
      >
        <template v-slot:append>
          <q-icon
            :name="showPassword ? 'visibility_off' : 'visibility'"
            class="cursor-pointer"
            @click="showPassword = !showPassword"
          />
        </template>
      </q-input>
      <q-btn
        class="full-width"
        color="primary"
        :label="tab == 'register' ? $t('Create account') : $t('Sign in')"
        type="submit"
        unelevated
        no-caps
        size="md"
      />
      <div v-if="tab == 'login'" class="text-center">
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          :label="$t('Forgot password?')"
          @click="sendPwdResetEmail"
        />
      </div>
    </q-form>

    <!-- Social / OAuth Provider Buttons -->
    <div class="row items-center q-my-md">
      <q-separator class="col" />
      <span class="q-px-sm text-caption text-grey-6">{{ $t("orContinueWith") }}</span>
      <q-separator class="col" />
    </div>

    <div class="row q-col-gutter-sm oauth-buttons">
      <div class="col-6">
        <q-btn
          outline
          no-caps
          class="full-width oauth-btn"
          color="grey-8"
          data-test="oauth-google"
          :loading="loadingProvider === 'google'"
          @click="onOAuthClick('google')"
        >
          <div class="row items-center no-wrap">
            <svg class="q-mr-xs" viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27A7.17 7.17 0 0 1 4.9 12c0-.79.14-1.57.38-2.27V6.58H1.25A11.97 11.97 0 0 0 0 12c0 1.92.45 3.74 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span class="text-weight-medium">{{ $t("signInWithGoogle") }}</span>
          </div>
        </q-btn>
      </div>

      <div class="col-6">
        <q-btn
          outline
          no-caps
          class="full-width oauth-btn"
          color="grey-8"
          data-test="oauth-microsoft"
          :loading="loadingProvider === 'microsoft'"
          @click="onOAuthClick('microsoft')"
        >
          <div class="row items-center no-wrap">
            <svg class="q-mr-xs" viewBox="0 0 23 23" width="16" height="16">
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H12z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H12z"/>
            </svg>
            <span class="text-weight-medium">{{ $t("signInWithMicrosoft") }}</span>
          </div>
        </q-btn>
      </div>

      <div class="col-6">
        <q-btn
          outline
          no-caps
          class="full-width oauth-btn"
          color="grey-8"
          data-test="oauth-apple"
          :loading="loadingProvider === 'apple'"
          @click="onOAuthClick('apple')"
        >
          <div class="row items-center no-wrap">
            <svg class="q-mr-xs" viewBox="0 0 170 170" width="16" height="16" fill="currentColor">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.71-11.65-14.01-6.19-9.59-10.92-20.67-14.19-33.24-3.26-12.58-4.9-24.16-4.9-34.76 0-14.79 3.86-27.18 11.58-37.17 7.72-9.99 17.65-15.11 29.79-15.37 5.22 0 10.66 1.41 16.31 4.23 5.65 2.83 9.4 4.3 11.26 4.41 1.63 0 5.65-1.57 12.06-4.7 6.41-3.14 12.16-4.53 17.26-4.17 13.48.97 24.13 5.86 31.95 14.67-11.74 7.07-17.5 16.9-17.26 29.5.33 9.78 4.02 18.04 11.08 24.78 7.07 6.74 15.44 10.55 25.11 11.41-2.28 7.07-5.06 14.13-8.33 21.18zM119.22 33.15c0-7.39 2.66-14.35 7.99-20.87 5.33-6.52 11.85-10.98 19.57-13.38.76 2.07 1.14 4.24 1.14 6.52 0 7.39-2.77 14.4-8.32 21.03-5.54 6.63-12.12 10.98-19.74 13.04-.22-2.17-.64-4.28-.64-6.34z"/>
            </svg>
            <span class="text-weight-medium">{{ $t("signInWithApple") }}</span>
          </div>
        </q-btn>
      </div>

      <div class="col-6">
        <q-btn
          outline
          no-caps
          class="full-width oauth-btn"
          color="grey-8"
          data-test="oauth-wechat"
          :loading="loadingProvider === 'wechat'"
          @click="showWeChatDialog = true"
        >
          <div class="row items-center no-wrap">
            <svg class="q-mr-xs" viewBox="0 0 24 24" width="18" height="18" fill="#07C160">
              <path d="M8.5 2C3.8 2 0 5.36 0 9.5c0 2.37 1.25 4.48 3.2 5.86l-.82 2.45c-.09.28.18.53.44.42l2.96-1.28c.84.28 1.76.45 2.72.45.32 0 .64-.02.95-.06a7.4 7.4 0 0 1-.2-1.74c0-4.2 3.76-7.6 8.4-7.6.43 0 .86.03 1.27.09C17.65 4.34 13.43 2 8.5 2zM6 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.2 3.1c-3.9 0-7.1 2.8-7.1 6.2 0 1.94 1.03 3.68 2.63 4.8l-.67 2.01c-.08.23.15.44.36.35l2.43-1.05c.7.23 1.45.36 2.25.36 3.9 0 7.1-2.8 7.1-6.2 0-3.4-3.2-6.2-7.1-6.2zm-2.45 3.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm4.5 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>
            </svg>
            <span class="text-weight-medium">{{ $t("signInWithWeChat") }}</span>
          </div>
        </q-btn>
      </div>
    </div>

    <!-- WeChat / Regional Sign-in Dialog -->
    <q-dialog v-model="showWeChatDialog">
      <q-card style="min-width: 320px; max-width: 440px;" class="q-pa-md">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-weight-bold">{{ $t("weChatSignInTitle") }}</div>
          <q-space />
          <q-btn icon="close" flat round dense @click="showWeChatDialog = false" />
        </q-card-section>

        <q-card-section class="text-body2 text-grey-8">
          {{ $t("weChatSignInDesc") }}
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-input
            v-model="customToken"
            outlined
            dense
            type="textarea"
            rows="3"
            name="customToken"
            :label="$t('enterCustomToken')"
            :placeholder="$t('tokenPlaceholder')"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat :label="$t('Cancel')" @click="showWeChatDialog = false" no-caps />
          <q-btn
            color="primary"
            unelevated
            no-caps
            :label="$t('authVerifyToken')"
            :disable="!customToken.trim()"
            :loading="loadingProvider === 'token'"
            @click="submitCustomToken"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script>
import { mapActions } from "vuex";

export default {
  props: ["tab"],
  data() {
    return {
      formData: {
        email: "",
        password: ""
      },
      showPassword: false,
      loadingProvider: null,
      showWeChatDialog: false,
      customToken: ""
    };
  },
  methods: {
    ...mapActions("auth", [
      "registerUser",
      "loginUser",
      "sendPasswordResetEmail",
      "loginWithGoogle",
      "loginWithMicrosoft",
      "loginWithApple",
      "loginWithCustomToken"
    ]),
    isValidEmailAddress(email) {
      const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      return re.test(String(email).toLowerCase());
    },
    submitForm() {
      this.$refs.email.validate();
      this.$refs.password.validate();
      if (!this.$refs.email.hasError && !this.$refs.password.hasError) {
        if (this.tab === "login") {
          this.loginUser(this.formData);
        } else {
          this.registerUser(this.formData);
        }
      }
    },
    sendPwdResetEmail() {
      this.$refs.email.validate();
      if (!this.$refs.email.hasError) {
        this.sendPasswordResetEmail(this.formData);
      }
    },
    async onOAuthClick(provider) {
      this.loadingProvider = provider;
      try {
        if (provider === "google") {
          await this.loginWithGoogle();
        } else if (provider === "microsoft") {
          await this.loginWithMicrosoft();
        } else if (provider === "apple") {
          await this.loginWithApple();
        }
      } catch (err) {
        console.error(`${provider} sign-in error:`, err);
      } finally {
        this.loadingProvider = null;
      }
    },
    async submitCustomToken() {
      if (!this.customToken.trim()) return;
      this.loadingProvider = "token";
      try {
        await this.loginWithCustomToken(this.customToken.trim());
        this.showWeChatDialog = false;
        this.customToken = "";
      } catch (err) {
        console.error("Custom token sign-in error:", err);
      } finally {
        this.loadingProvider = null;
      }
    }
  }
};
</script>

<style scoped>
.oauth-btn {
  border-color: #e0e0e0;
  transition: all 0.2s ease;
}
.oauth-btn:hover {
  background: rgba(0, 0, 0, 0.03);
  border-color: #bdbdbd;
}
</style>
