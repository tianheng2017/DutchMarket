const Token = artifacts.require("Token")
const DutchMarket = artifacts.require("DutchMarket")

module.exports = async function(deployer, network, accounts) {
    // Deploy an ERC20 token contract
    await deployer.deploy(Token, 'My Token', 'MTK');
    const tokenInstance = await Token.deployed()

    // Deploy a Dutch Market contract
    await deployer.deploy(DutchMarket);
    const dutchMarketInstance = await DutchMarket.deployed()
    // Authorize the Dutch Market contract for the ERC20 token
    await tokenInstance.approve(dutchMarketInstance.address, web3.utils.toWei("100000000", "ether"))

    // Transfer 100,000 tokens to Seller 1
    await tokenInstance.transfer(accounts[1], web3.utils.toWei("100000", "ether"))
    // Seller 1 authorizes the Dutch Market contract for all of their tokens
    await tokenInstance.approve(dutchMarketInstance.address, web3.utils.toWei("100000000", "ether"), { from: accounts[1] })

    // Transfer 100,000 tokens to Seller 2
    await tokenInstance.transfer(accounts[2], web3.utils.toWei("100000", "ether"))
    // Seller 2 authorizes the Dutch Market contract for all of their tokens
    await tokenInstance.approve(dutchMarketInstance.address, web3.utils.toWei("100000000", "ether"), {from: accounts[2]})
}
