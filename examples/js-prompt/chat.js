function execute(vars, mimeTypes) {
  const lastPrompt = vars.$history[vars.$history.length - 1].prompt;
  const newPrompt = lastPrompt.map((part) => {
    // Flip the roles from the last prompt
    if ('user' in part) {
      return { assistant: part.user };
    }
    if ('assistant' in part) {
      return { user: part.assistant };
    }

    // Flip the system prompt
    if ('system' in part) {
      return {
        system: part.system[0] === vars.systemA ? vars.systemB : vars.systemA,
      };
    }
  });

  // Append the latest message as a user prompt
  newPrompt.push({
    user: vars.$output,
  });
  return newPrompt;
}
