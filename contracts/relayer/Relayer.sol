// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

error Relayer__InvalidCall();

interface IWhoIsWho {
    function mint(address, uint256) external payable;
}

contract Relayer {
    uint256 public mintPrice = 0.02 ether;
    uint256 public presaleStartDate = 1684699200;
    uint256 public presaleEndDate = 1684700100;
    bytes32 public immutable wlMerkleRoot;
    address public owner;
    address public immutable whoIsWhoContract;

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Relayer__InvalidCall();
        }
        _;
    }

    constructor(address _whoIsWhoContract, bytes32 _wlMerkleRoot) {
        whoIsWhoContract = _whoIsWhoContract;
        wlMerkleRoot = _wlMerkleRoot;
        owner = msg.sender;
    }

    function mintRelay(uint256 _mintAmount, bytes32[] calldata _merkleProof) external payable {
        bytes32 leaf = keccak256(abi.encodePacked(address(msg.sender)));

        if (
            _mintAmount == 0 ||
            _mintAmount * mintPrice > msg.value ||
            block.timestamp < presaleStartDate ||
            block.timestamp > presaleEndDate ||
            !MerkleProof.verify(_merkleProof, wlMerkleRoot, leaf)
        ) {
            revert Relayer__InvalidCall();
        }

        IWhoIsWho(whoIsWhoContract).mint{value: msg.value}(address(msg.sender), _mintAmount);
    }

    function setMintPrice(uint256 _mintPrice) external onlyOwner {
        mintPrice = _mintPrice;
    }

    function setPresaleStartDate(uint256 _presaleStartDate) external onlyOwner {
        presaleStartDate = _presaleStartDate;
    }

    function setPresaleEndDate(uint256 _presaleEndDate) external onlyOwner {
        presaleEndDate = _presaleEndDate;
    }
}
