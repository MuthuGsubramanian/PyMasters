"""Profile and settings layout."""
from __future__ import annotations

import streamlit as st


def render_profile(*, user: dict) -> None:
    """Render the learner profile management area."""

    st.title("Profile & Preferences")
    st.caption("Keep your learner profile up to date to receive the best recommendations.")

    with st.form("profile-form"):
        col1, col2 = st.columns(2)
        with col1:
            name = st.text_input("Full name", value=user.get("name", ""))
            skill = st.selectbox(
                "Skill level",
                ["Beginner", "Intermediate", "Advanced"],
                index=["Beginner", "Intermediate", "Advanced"].index(user.get("skill_level", "Beginner")),
            )
        with col2:
            email = st.text_input("Email", value=user.get("email", ""))
            goals = st.text_area(
                "Learning goals",
                value=", ".join(user.get("learning_goals", [])),
                help="Comma separated goals help us tailor recommendations.",
            )
        notifications = st.multiselect(
            "Notify me about",
            ["Weekly digest", "New modules", "Community events"],
            default=["Weekly digest", "New modules"],
        )
        submitted = st.form_submit_button("Save changes")

    if submitted:
        st.success("Profile updated! Your preferences will be reflected in upcoming recommendations.")
        st.session_state.user = {
            **user,
            "name": name,
            "skill_level": skill,
            "email": email,
            "learning_goals": [goal.strip() for goal in goals.split(",") if goal.strip()],
            "notifications": notifications,
        }

    st.markdown("---")
    st.subheader("Account settings")
    st.toggle("Dark mode", value=True, help="Theme toggles can be wired into custom CSS.")
    st.toggle("Two-factor authentication", value=False, help="Integrate with an auth provider.")
