export { getUserDisplayNameOrTruncatedEmail, getUserPhotoURL };

function getUserDisplayNameOrTruncatedEmail(currentOrgUsers, userId) {
  if (userId === undefined) return "";
  let foundUser = currentOrgUsers.find(u => u.id == userId);
  if (foundUser)
    return foundUser.displayName
      ? foundUser.displayName
      : foundUser.email.split("@")[0];
  else return userId;
}

function getUserPhotoURL(currentOrgUsers, userId) {
  let foundUser = currentOrgUsers.find(u => u.id == userId);
  if (foundUser) return foundUser.photoURL ? foundUser.photoURL : undefined;
  else return null;
}
