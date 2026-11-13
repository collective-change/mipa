<template>
  <q-page padding>
    <div class="members-page">
      <div class="text-h5">{{ $t("Members") }}</div>
      <div v-if="currentOrg" class="text-subtitle1 text-grey-8 q-mb-md">{{ currentOrg.name }}</div>

      <q-card v-if="isAdmin" flat bordered class="q-mb-lg">
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">{{ $t("Invite someone") }}</div>
          <div class="text-body2 text-grey-8">{{ $t("inviteHelp") }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-form @submit.prevent="invite" class="row q-col-gutter-sm items-start">
            <q-input
              v-model="inviteEmail"
              ref="inviteEmail"
              class="col-12 col-sm"
              outlined
              dense
              type="email"
              :label="$t('Email')"
              lazy-rules
              :rules="[(val) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val || '') || $t('Please enter a valid email address.')]"
            />
            <q-select
              v-model="inviteRole"
              class="col-6 col-sm-3"
              outlined
              dense
              emit-value
              map-options
              :options="roleOptions"
              :label="$t('Role')"
            />
            <div class="col-6 col-sm-auto">
              <q-btn type="submit" unelevated no-caps color="primary" icon="send" :label="$t('Invite')" :loading="inviting" />
            </div>
          </q-form>
        </q-card-section>
        <template v-if="orgInvitations.length">
          <q-separator />
          <q-list dense>
            <q-item-label header>{{ $t("Waiting for a reply") }}</q-item-label>
            <q-item v-for="invitation in orgInvitations" :key="invitation.id">
              <q-item-section avatar><q-icon name="schedule" color="grey" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ invitation.email }}</q-item-label>
                <q-item-label caption>{{ $t(roleLabel(invitation.role)) }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat no-caps dense color="primary" :label="$t('Withdraw')"
                  @click="deleteInvitation({ orgId, invitationId: invitation.id })" />
              </q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card>

      <q-list bordered separator class="rounded-borders">
        <q-item v-for="member in sortedMembers" :key="member.id">
          <q-item-section avatar>
            <q-avatar color="blue-1" text-color="primary">{{ initial(member) }}</q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label>
              {{ member.displayName || member.email }}
              <span v-if="member.id == userId" class="text-grey-7">({{ $t("you") }})</span>
            </q-item-label>
            <q-item-label caption>{{ member.email }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center q-gutter-sm no-wrap">
              <q-chip v-if="adminIds.includes(member.id)" dense color="primary" text-color="white">
                {{ $t("Admin") }}
              </q-chip>
              <q-btn v-if="isAdmin || member.id == userId" flat round dense icon="more_vert" :aria-label="$t('Member options')">
                <q-menu auto-close>
                  <q-list style="min-width: 200px">
                    <template v-if="isAdmin">
                      <q-item v-if="!adminIds.includes(member.id)" clickable @click="setRole(member, 'admin')">
                        <q-item-section>{{ $t("Make admin") }}</q-item-section>
                      </q-item>
                      <q-item v-else clickable @click="setRole(member, 'member')">
                        <q-item-section>{{ $t("Remove admin role") }}</q-item-section>
                      </q-item>
                    </template>
                    <q-item clickable @click="remove(member)">
                      <q-item-section class="text-negative">
                        {{ member.id == userId ? $t("Leave organization") : $t("Remove from organization") }}
                      </q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<script>
import { mapState, mapGetters, mapActions } from "vuex";

export default {
  data() {
    return {
      inviteEmail: "",
      inviteRole: "member",
      inviting: false
    };
  },
  computed: {
    ...mapState("auth", ["userId"]),
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("members", ["orgInvitations"]),
    ...mapGetters("users", ["currentOrgUsers"]),
    orgId() {
      return this.$route.params.orgId;
    },
    adminIds() {
      return this.currentOrg ? this.currentOrg.superAdmins || [] : [];
    },
    isAdmin() {
      return this.adminIds.includes(this.userId);
    },
    roleOptions() {
      return [
        { value: "member", label: this.$t("Member") },
        { value: "admin", label: this.$t("Admin") }
      ];
    },
    sortedMembers() {
      return [...this.currentOrgUsers].sort((a, b) =>
        (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")
      );
    }
  },
  methods: {
    ...mapActions("members", [
      "inviteMember",
      "deleteInvitation",
      "removeMember",
      "setMemberRole",
      "bindOrgInvitations",
      "unbindOrgInvitations"
    ]),
    roleLabel(role) {
      return role == "admin" ? "Admin" : "Member";
    },
    initial(member) {
      return (member.displayName || member.email || "?").charAt(0).toUpperCase();
    },
    async invite() {
      if (!(await this.$refs.inviteEmail.validate())) return;
      const email = this.inviteEmail.trim().toLowerCase();
      if (this.currentOrgUsers.some((m) => (m.email || "").toLowerCase() == email)) {
        this.$q.notify(this.$t("alreadyMember"));
        return;
      }
      this.inviting = true;
      const ok = await this.inviteMember({ org: this.currentOrg, email, role: this.inviteRole });
      this.inviting = false;
      if (ok) {
        this.inviteEmail = "";
        this.$refs.inviteEmail.resetValidation();
      }
    },
    setRole(member, role) {
      this.setMemberRole({ orgId: this.orgId, memberId: member.id, role });
    },
    remove(member) {
      const leaving = member.id == this.userId;
      this.$q
        .dialog({
          title: leaving ? this.$t("Leave organization") : this.$t("Remove from organization"),
          message: leaving
            ? this.$t("leaveConfirm", { name: this.currentOrg.name })
            : this.$t("removeConfirm", { name: member.displayName || member.email }),
          cancel: true
        })
        .onOk(async () => {
          const ok = await this.removeMember({ orgId: this.orgId, memberId: member.id });
          if (ok && leaving) this.$router.push("/");
        });
    }
  },
  watch: {
    isAdmin: {
      immediate: true,
      handler(isAdmin) {
        if (isAdmin) this.bindOrgInvitations(this.orgId);
      }
    }
  },
  beforeUnmount() {
    this.unbindOrgInvitations();
  }
};
</script>

<style scoped>
.members-page {
  max-width: 760px;
  margin: 0 auto;
}
</style>
