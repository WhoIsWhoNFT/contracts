// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

//-------------------------------------------------------------------
//  __          ___          _____  __          ___
//  \ \        / / |        |_   _| \ \        / / |
//   \ \  /\  / /| |__   ___  | |  __\ \  /\  / /| |__   ___
//    \ \/  \/ / | '_ \ / _ \ | | / __\ \/  \/ / | '_ \ / _ \
//     \  /\  /  | | | | (_) || |_\__ \\  /\  /  | | | | (_) |
//      \/  \/   |_| |_|\___/_____|___/ \/  \/   |_| |_|\___/
//
//-------------------------------------------------------------------
//
// wagmi

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

error WhoIsWho__MaxMint();
error WhoIsWho__InsufficientFunds();
error WhoIsWho__StageNotReady();
error WhoIsWho__InvalidProof();
error WhoIsWho__AlreadyClaimed();
error WhoIsWho__NonExistentTokenId();

contract WhoIsWho is ERC721A, Ownable, ReentrancyGuard {
    using Strings for uint256;

    enum SaleStage {
        IDLE,
        PRESALE_OG,
        PRESALE_WL,
        PUBLIC_SALE
    }

    ///////////////////////////////////////////////
    // Constants
    //////////////////////////////////////////////

    // Presale price for OG members
    uint256 public constant PRESALE_PRICE_OG = 0.025 ether;

    // Presale price for whitelisted members
    uint256 public constant PRESALE_PRICE_WL = 0.025 ether;

    // Maximum mint per transaction for og members
    uint32 public constant PRESALE_MAX_MINT_OG = 5;

    // Maximum mint per transaction for whitelisted members
    uint32 public constant PRESALE_MAX_MINT_WL = 5;

    // Minutes interval for OG members to mint before presale for whitelisted members
    uint16 public constant PRESALE_INTERVAL = 900; // 15 minutes in ms

    // Number of reserved tokens
    uint16 public constant RESERVED_TOKENS = 20;

    ///////////////////////////////////////////////
    // Storage
    //////////////////////////////////////////////

    // Price per token for public sale
    uint256 public price;

    // Presale Date
    uint64 public presaleDate;

    // Public sale date
    uint64 public publicSaleDate;

    // Reveal Date
    uint64 public revealDate;

    // Maximum mint per transaction for public sale
    uint32 public maxMintPerTx;

    // Merkle roots
    bytes32 public ogMerkleRoot;
    bytes32 public wlMerkleRoot;

    // Metadata URI
    string public metadataBaseURI;

    // Records of already claimed whitelisted wallets
    mapping(address => bool) public hasWlClaimed;
    mapping(address => bool) public hasOgClaimed;

    ///////////////////////////////////////////////
    // Constructor
    //////////////////////////////////////////////

    constructor(
        uint256 _price,
        uint32 _maxMintPerTx,
        uint64 _presaleDate,
        uint64 _publicSaleDate,
        uint64 _revealDate,
        bytes32 _ogMerkleRoot,
        bytes32 _wlMerkleRoot,
        string memory _metadataBaseURI
    ) ERC721A("Who Is Who", "WhoIsWho") {
        // Set public price
        price = _price;

        // Set max mint per transaction
        maxMintPerTx = _maxMintPerTx;

        // Initial presale, public, and reveal dates are set during contract's deployment.
        // These are changeable variables; this might change after the contract has been deployed
        presaleDate = _presaleDate;
        publicSaleDate = _publicSaleDate;
        revealDate = _revealDate;

        // Merkle roots for og and whitelisted members, will be used to verify wallets for whitelist mint
        ogMerkleRoot = _ogMerkleRoot;
        wlMerkleRoot = _wlMerkleRoot;

        // Set metadata base uri
        metadataBaseURI = _metadataBaseURI;

        // Mint reserved tokens upon deployment
        _safeMint(_msgSender(), RESERVED_TOKENS);
    }

    ///////////////////////////////////////////////
    // Modifiers
    //////////////////////////////////////////////

    modifier mintCompliance(uint256 _mintAmount, uint256 _maxPurchase) {
        if (_mintAmount > _maxPurchase) {
            revert WhoIsWho__MaxMint();
        }

        unchecked {
            uint256 totalSupplyAfterMint = totalSupply() + _mintAmount;

            if (totalSupplyAfterMint > _maxPurchase) {
                revert WhoIsWho__MaxMint();
            }
        }

        _;
    }

    modifier mintPriceCompliance(uint256 _mintAmount, uint256 _cost) {
        unchecked {
            uint256 totalCost = _cost * _mintAmount;

            if (msg.value < totalCost) {
                revert WhoIsWho__InsufficientFunds();
            }
        }

        _;
    }

    modifier stageCompliance(SaleStage _stage) {
        SaleStage stage = getSaleStage();

        if (stage != _stage) {
            revert WhoIsWho__StageNotReady();
        }
        _;
    }

    ///////////////////////////////////////////////
    // Public methods
    //////////////////////////////////////////////

    function ogMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_OG)
        mintCompliance(_mintAmount, PRESALE_MAX_MINT_OG)
        mintPriceCompliance(_mintAmount, PRESALE_PRICE_OG)
    {
        if (hasOgClaimed[_msgSender()]) {
            revert WhoIsWho__AlreadyClaimed();
        }

        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));

        if (!MerkleProof.verify(_merkleProof, ogMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }

        hasOgClaimed[_msgSender()] = true;
        _safeMint(_msgSender(), _mintAmount);
    }

    function wlMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_WL)
        mintCompliance(_mintAmount, PRESALE_MAX_MINT_WL)
        mintPriceCompliance(_mintAmount, PRESALE_PRICE_WL)
    {
        if (hasWlClaimed[_msgSender()]) {
            revert WhoIsWho__AlreadyClaimed();
        }

        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));

        if (!MerkleProof.verify(_merkleProof, wlMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }

        hasWlClaimed[_msgSender()] = true;
        _safeMint(_msgSender(), _mintAmount);
    }

    function mint(
        uint256 _mintAmount
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PUBLIC_SALE)
        mintCompliance(_mintAmount, maxMintPerTx)
        mintPriceCompliance(_mintAmount, price)
    {
        _safeMint(_msgSender(), _mintAmount);
    }

    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        if (!_exists(_tokenId)) {
            revert WhoIsWho__NonExistentTokenId();
        }

        if (!isReveal()) {
            return hiddenMetadataUri();
        }

        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, _tokenId.toString(), ".json"));
        }

        return "";
    }

    function hiddenMetadataUri() public view returns (string memory) {
        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, "hidden.json"));
        }

        return "";
    }

    ///////////////////////////////////////////////
    // Internal methods
    //////////////////////////////////////////////

    function isReveal() internal view returns (bool) {
        uint64 timeNow = uint64(block.timestamp);
        return timeNow >= revealDate;
    }

    function getSaleStage() internal view returns (SaleStage stage) {
        uint64 timeNow = uint64(block.timestamp);

        if (timeNow >= publicSaleDate) {
            return SaleStage.PUBLIC_SALE;
        }

        if (timeNow >= presaleDate) {
            return SaleStage.PRESALE_WL;
        }

        unchecked {
            uint256 interval = presaleDate + PRESALE_INTERVAL;

            if (timeNow >= interval) {
                return SaleStage.PRESALE_OG;
            }
        }

        return SaleStage.IDLE;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return metadataBaseURI;
    }

    ///////////////////////////////////////////////
    // Admin methods
    //////////////////////////////////////////////

    function mint(address _recipient, uint256 _mintAmount) external payable onlyOwner nonReentrant {
        _safeMint(_recipient, _mintAmount);
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
    }

    function setMaxMintPerTx(uint32 _maxMintPerTx) external onlyOwner {
        maxMintPerTx = _maxMintPerTx;
    }

    function setMetadataBaseURI(string memory _uri) external onlyOwner {
        metadataBaseURI = _uri;
    }

    function setOgMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        ogMerkleRoot = _merkleRoot;
    }

    function setWlMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        wlMerkleRoot = _merkleRoot;
    }

    function setPresaleDate(uint64 _date) external onlyOwner {
        presaleDate = _date;
    }

    function setPublicSaleDate(uint64 _date) external onlyOwner {
        publicSaleDate = _date;
    }

    function setRevealDate(uint64 _date) external onlyOwner {
        revealDate = _date;
    }

    function withdraw() external onlyOwner nonReentrant {
        (bool os, ) = payable(owner()).call{value: address(this).balance}("");
        require(os, "Transfer failed");
    }
}
