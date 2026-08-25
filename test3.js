const str = 'A -. "text" .- B \n A -. "text" . B \n A -. "text" -> B \n A -. "text" .-> B \n A -. text . B';
console.log(str.replace(/-\.\s*['"]?((?:[^'"]|\\\')+)['"]?\s*\.?\s*(->|->>|>|-)?/g, '-.->|"$1"|'));
