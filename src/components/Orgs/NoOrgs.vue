<template>
  <transition
    appear
    enter-active-class="animated zoomIn"
    leave-active-class="animated zoomOut absolute-top"
  >
    <q-banner class="bg-grey-3">
      <template v-slot:avatar>
        <q-icon name="people" color="primary" />
      </template>
      A team is a group of people with a goal. Add a team to get started!
      <template
        v-slot:action
      >
        <q-btn @click="$root.$emit('showAddOrg')" flat color="primary" label="Add organization" />
      </template>
    </q-banner>
  </transition>
</template>

<script>
export default {};
</script>
