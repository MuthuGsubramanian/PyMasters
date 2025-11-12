"""Profile management page."""
from __future__ import annotations

import streamlit as st

from pymasters_app.utils.auth import AuthManager
from utils.streamlit_helpers import rerun


def render(*, auth_manager: AuthManager, user: dict[str, str]) -> None:
    """Render the profile management view."""
    st.write("## Profile")
    st.caption("Update your personal information and security preferences.")

    with st.form("profile-form"):
        name = st.text_input("Full name", value=user.get("name", ""))
        email = st.text_input("Email", value=user.get("email", ""))
        submitted = st.form_submit_button("Save changes", use_container_width=True)

    if submitted:
        ok, message, updated_user = auth_manager.update_profile(user["id"], name=name, email=email)
        if not ok:
            st.error(message or "We couldn't update your profile right now.")
        else:
            st.success("Profile updated successfully.")
            if updated_user:
                st.session_state["user"] = updated_user
            rerun()

    st.markdown("### Change password")
    with st.form("password-form", clear_on_submit=True):
        current_password = st.text_input("Current password", type="password")
        new_password = st.text_input("New password", type="password")
        confirm_password = st.text_input("Confirm new password", type="password")
        password_submitted = st.form_submit_button("Update password", use_container_width=True)

    if password_submitted:
        if not current_password or not new_password:
            st.error("Please complete all fields.")
        elif new_password != confirm_password:
            st.error("Your new passwords do not match.")
        else:
            ok, message = auth_manager.change_password(
                user["id"], current_password=current_password, new_password=new_password
            )
            if not ok:
                st.error(message or "Unable to change the password right now.")
            else:
                st.success("Password updated successfully.")

    st.markdown("### Danger zone")
    st.info("Need to sign out? Use the **Sign out** button in the header to end your session.")
