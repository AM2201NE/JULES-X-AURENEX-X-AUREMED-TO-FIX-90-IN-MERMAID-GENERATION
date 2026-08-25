const str = 'A -. "text" .- B \n A -. "text" . B \n A -. "text" .-> B \n A -. text .-> B';
console.log(str.replace(/-\.\s*['"]?((?:[^'"\n]|\\\')*?)['"]?\s*\.(->>|->|>|-)?/g, '-.->|"$1"|'));
