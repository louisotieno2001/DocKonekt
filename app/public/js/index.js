async function fetchProfile() {
    try {
        const response = await fetch('/profile');
        if (!response.ok) {
            throw new Error('Failed to fetch profile data');
        }
        const data = await response.json();
        const { imagePath } = data; // Assuming your backend returns imagePath

        // Update the profile image
        const profileDiv = document.getElementById('profile');
        profileDiv.innerHTML = `<img src="${imagePath}" alt="Profile Image" class="profile-image">`;
    } catch (error) {
        console.error('Error fetching profile:', error);
    }
}

// Call fetchProfile function when the DOM content is loaded
document.addEventListener('DOMContentLoaded', function () {
    fetchProfile();
});
