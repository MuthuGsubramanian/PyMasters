import streamlit as st
import warnings

warnings.filterwarnings('ignore')

st.set_page_config(page_title="Pymasters", layout="wide")

st.title("PyMasters")

st.sidebar.image('https://i.pinimg.com/originals/92/60/dd/9260dd459aa4566cfa25e86a3f10ea1b.png')

col1, col2, col3 = st.columns(3)
with col1:
    st.markdown('The Python Way')
    st.text('This is a place to explore and develop oppertunities with python')
with col2:
    st.markdown('Python Projects')
    st.text('This area is to analyze the python projects completed')
with col3:
    st.markdown('Future Projects')
    st.text('This area is to discuss on the future projects')