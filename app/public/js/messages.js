//Form validation for connection requests
const mtForm = document.getElementById('form');
const uname = document.getElementById("name");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const message = document.getElementById("message");
const submit = document.getElementById("submit");

submit.addEventListener("click", async (e) => {
  e.preventDefault();

  //Get the values from the input fields
  const unameValue = uname.value.trim();
  const emailValue = email.value.trim();
  const phoneValue = phone.value.trim();
  const messageValue = message.value.trim();

  // Check if any of the fields is empty
  if (unameValue === "" && emailValue === "" && phoneValue === "" && messageValue === "") {
    alert("Please fill all input fields");
  }
  else {
    let data = {
      name: unameValue,
      email: emailValue,
      phone: phoneValue,
      message: messageValue,
    }

    try {
      
    
    const res = await fetch('/messages', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    const json = await res.json();

    if(res.ok){
      // Reset the form after successful submission
      uname.value = "";
      email.value = "";
      phone.value = "";
      message.value = "";

      window.confirm("Your message is sucessfully sent");
      mtForm.style.display = 'none';
      playFireworks();
    }
    else{
       console.log("Something went wrong");
    }

  } catch (error) {
    console.error("Error during sending of message:", error); 
  }
    
  }
});

function fireworks() {
  const canvas = document.getElementById('fireworksCanvas');
  const ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const fireworksArray = [];

  function createFirework() {
      const firework = {
          x: Math.random() * canvas.width,
          y: canvas.height,
          color: `rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255})`,
          radius: 2,
          speed: Math.random() * 20 + 10, // Adjusted for faster speed
          angle: Math.random() * Math.PI * 2,
          life: true,
      };

      fireworksArray.push(firework);
  }

  function drawFirework(firework) {
      ctx.beginPath();
      ctx.arc(firework.x, firework.y, firework.radius, 0, Math.PI * 2);
      ctx.fillStyle = firework.color;
      ctx.fill();
  }

  function updateFireworks() {
      fireworksArray.forEach((firework, index) => {
          if (firework.life) {
              firework.x += Math.cos(firework.angle) * firework.speed;
              firework.y += Math.sin(firework.angle) * firework.speed;
              firework.radius *= 1.03; // Adjusted for a faster growth rate

              drawFirework(firework);

              if (firework.y < 0 || firework.x < 0 || firework.x > canvas.width || firework.radius > 15) {
                  fireworksArray.splice(index, 1);
              }
          }
      });
  }

  function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (Math.random() < 0.08) { // Adjusted for more frequent fireworks
          createFirework();
      }

      updateFireworks();

      requestAnimationFrame(animate);
  }

  animate();
}

// Call this function after a successful form submission
function playFireworks() {
  fireworks();
}



