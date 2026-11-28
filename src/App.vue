<template>
  <router-view />
</template>

<script>
import { pickActions } from "@/store/pinia-helpers";
import { useSettingsStore } from "@/store/store-settings";
import { useAuthStore } from "@/store/store-auth";

export default {
  methods: {
    ...pickActions(useSettingsStore, ["getSettings"]),
    ...pickActions(useAuthStore, ["handleAuthStateChange"]),
  },
  mounted() {
    this.getSettings();
    this.handleAuthStateChange();
  },
};
</script>

<style>
.text-strikethrough {
  text-decoration: line-through;
}
</style>
