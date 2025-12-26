const out = document.getElementById("output");
const btn = document.getElementById("ask");

btn.onclick = async () => {
  if (!OPENAI_API_KEY) {
    out.textContent = "ERROR: Paste your API key in config.js";
    return;
  }

  const prompt = document.getElementById("prompt").value;
  out.textContent = "Thinking...";

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You generate concise Lua scene-manager code for a triangle-based renderer. No explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4
      })
    });

    const j = await r.json();
    out.textContent =
      j.choices && j.choices[0]
        ? j.choices[0].message.content
        : JSON.stringify(j, null, 2);

  } catch (e) {
    out.textContent = "Request failed: " + e;
  }
};
