// Isolated integration chain; never binds to an external network interface.
import ganache from 'ganache';
const server=ganache.server({chain:{chainId:1990,hardfork:'shanghai'},wallet:{totalAccounts:5},logging:{quiet:true}});
await server.listen(8547,'127.0.0.1');
console.log('Isolated test EVM at http://127.0.0.1:8547. Accounts and receipts are local only.');
process.on('SIGINT',async()=>{await server.close();process.exit(0);});
