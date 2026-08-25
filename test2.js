const str = 'D1a -. "Aggravé par" .-> E1a;';
console.log(str.replace(/-\.\s*['"]?((?:[^'"]|\\\')+)['"]?\s*\.(-|>|->)?/g, '-.->|"$1"|'));
