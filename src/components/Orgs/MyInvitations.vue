<template>
  <div v-if="myInvitations.length" class="q-mb-lg">
    <div class="text-h6 q-mb-sm">{{ $t("Invitations") }}</div>

    <q-banner v-if="!emailVerified" class="bg-amber-1 q-mb-md" rounded>
      <template v-slot:avatar>
        <q-icon name="mark_email_unread" color="amber-9" />
      </template>
      {{ $t("verifyEmailToAccept") }}
      <template v-slot:action>
        <q-btn flat no-caps color="primary" :label="$t('Send verification email')" @click="sendVerificationEmail" />
        <q-btn flat no-caps color="primary" :label="$t('I have verified my email')" @click="checkVerified" />
      </template>
    </q-banner>

    <q-list bordered separator class="rounded-borders">
      <q-item v-for="invitation in myInvitations" :key="invitation.id">
        <q-item-section avatar>
          <q-icon name="group_add" color="primary" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-medium">{{ invitation.orgName }}</q-item-label>
          <q-item-label caption>
            {{ $t("invitedBy", { name: invitation.invitedByName, role: $t(roleLabel(invitation.role)) }) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-sm no-wrap">
            <q-btn flat no-caps :label="$t('Decline')" @click="decline(invitation)" />
            <q-btn
              unelevated
              no-caps
              color="primary"
              :label="$t('Accept')"
              :disable="!emailVerified"
              :loading="accepting == invitation.id"
              @click="accept(invitation)"
            />
          </div>
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script>
import { mapState, mapActions } from "vuex";
import { firebaseAuth } from "@/boot/firebase";

export default {
  data() {
    return {
      emailVerified: firebaseAuth.currentUser ? firebaseAuth.currentUser.emailVerified : false,
      accepting: null
    };
  },
  computed: {
    ...mapState("members", ["myInvitations"])
  },
  methods: {
    ...mapActions("members", [
      "acceptInvitation",
      "deleteInvitation",
      "sendVerificationEmail",
      "refreshEmailVerified",
      "bindMyInvitations",
      "unbindMyInvitations"
    ]),
    roleLabel(role) {
      return role == "admin" ? "Admin" : "Member";
    },
    async checkVerified() {
      this.emailVerified = await this.refreshEmailVerified();
      if (!this.emailVerified) {
        this.$q.notify(this.$t("emailNotVerifiedYet"));
      }
    },
    async accept(invitation) {
      this.accepting = invitation.id;
      await this.acceptInvitation({ orgId: invitation.orgId, invitationId: invitation.id });
      this.accepting = null;
    },
    decline(invitation) {
      this.$q
        .dialog({
          title: this.$t("Decline invitation"),
          message: this.$t("declineInvitationConfirm", { name: invitation.orgName }),
          cancel: true
        })
        .onOk(() =>
          this.deleteInvitation({ orgId: invitation.orgId, invitationId: invitation.id })
        );
    }
  },
  async mounted() {
    // On a fresh page load the signed-in user arrives a moment later.
    await firebaseAuth.authStateReady();
    if (!firebaseAuth.currentUser) return;
    this.emailVerified = firebaseAuth.currentUser.emailVerified;
    this.bindMyInvitations();
  },
  beforeUnmount() {
    this.unbindMyInvitations();
  }
};
</script>
