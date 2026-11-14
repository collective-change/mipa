<template>
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
</template>

<script>
//import { log } from "util";
import { mapActions } from "vuex";

export default {
  props: ["tab"],
  data() {
    return {
      formData: {
        email: "",
        password: "",
      },
      showPassword: false,
    };
  },
  methods: {
    ...mapActions("auth", ["registerUser", "loginUser", "sendPasswordResetEmail"]),
    isValidEmailAddress(email) {
      var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      return re.test(String(email).toLowerCase());
    },
    submitForm() {
      this.$refs.email.validate();
      this.$refs.password.validate();
      if (!this.$refs.email.hasError && !this.$refs.password.hasError) {
        if (this.tab == "login") {
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
  },
};
</script>
